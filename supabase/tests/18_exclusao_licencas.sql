-- =====================================================================
-- Exclusão de licenças: lixeira, restauração e exclusão definitiva, só
-- pelo administrador, com auditoria; a lixeira some de listas, mapa,
-- consulta pública e conflitos; o número liberado pode ser lançado de novo.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

create or replace function pg_temp.recusa(p_sql text, p_trecho text, p_msg text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERT FALHOU: %', p_msg;
exception
  when raise_exception or check_violation or unique_violation or insufficient_privilege then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if p_trecho is not null and position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'admin.excl@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000c2', 'gestor.excl@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000c3', 'cisp.excl@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000c1', 'Admin', 'gestor', true),
  ('00000000-0000-4000-8000-0000000000c2', 'Gestor', 'gestor', false),
  ('00000000-0000-4000-8000-0000000000c3', 'Consulta', 'cisp', false);

create temp table ids (nome text primary key, id uuid);
grant select, insert, update on ids to public;

-- Registro legado, com o gatilho de gravação desligado (só o dono da tabela faz isso).
do $$
declare op uuid; hist uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, executa_obras)
  values ('12345678000195', 'Operadora Excl S.A.', 'OpExcl', 'operadora', 'e1@e.test', true) returning id into op;
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, setores)
  values ('11222333000181', 'Terceirizada Excl Ltda.', 'TerExcl', 'terceirizada', 'e2@e.test', '{telecom}');
  insert into ids values ('op', op);
  alter table licencas disable trigger licencas_antes_de_gravar;
  insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, protocolo_data, situacao)
  values ('telecom', 'HIST-LEGADO-1', array['vala'], 'Histórico incompleto', op, '2024-01-10', 'indeferida')
  returning id into hist;
  alter table licencas enable trigger licencas_antes_de_gravar;
  insert into ids values ('hist', hist);
end $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
grant anon to cadex_test_app;
set local role cadex_test_app;

-- Gestor registra duas licenças.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000c2', true);
do $$
declare
  op uuid := (select id from ids where nome = 'op');
  ter uuid := (select id from empresas where cnpj = '11222333000181');
  trecho jsonb := jsonb_build_array(jsonb_build_object('logradouro', 'Rua Mem de Sá', 'inicio_lat', -22.905, 'inicio_lng', -43.11));
  a uuid; b uuid;
begin
  a := public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','NIT-050120/000801/2026','numero','801/2026',
    'tipo_intervencao','obra','tipos_obra',array['vala'],'escopo','Lançada por engano','executora_id',ter,'contratante_id',op,
    'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);
  b := public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','NIT-050120/000802/2026','numero','802/2026',
    'tipo_intervencao','servico','tipos_obra',array['rede'],'escopo','Outra licença','executora_id',ter,'contratante_id',op,
    'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua Longe', 'inicio_lat', -22.95, 'inicio_lng', -43.05)));
  insert into ids values ('a', a), ('b', b);
end $$;

-- 1. Quem não é administrador não exclui, por nenhum caminho.
do $$
declare a uuid := (select id from ids where nome = 'a');
begin
  perform pg_temp.recusa(format('select public.admin_excluir_licenca(%L)', a), 'Só o administrador', 'gestor excluiu pela função');
  perform pg_temp.recusa(format('update licencas set excluida_em = now() where id = %L', a), 'Só o administrador', 'gestor marcou a exclusão por update direto');
  perform pg_temp.recusa(format('delete from licencas where id = %L', a), 'apagada definitivamente', 'gestor apagou por delete direto');
  perform pg_temp.recusa(format('select public.admin_excluir_licenca_definitivamente(%L)', a), 'Só o administrador', 'gestor apagou pela função definitiva');
  perform pg_temp.assert((select excluida_em is null from licencas where id = a), 'licença foi marcada mesmo com as recusas');
end $$;

-- 2. Administrador exclui (lixeira), com motivo.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000c1', true);
do $$
declare a uuid := (select id from ids where nome = 'a');
begin
  perform public.admin_excluir_licenca(a, '  Lançada no processo errado  ');
  perform pg_temp.assert((select excluida_em is not null and excluida_por = '00000000-0000-4000-8000-0000000000c1'
                                 and excluida_motivo = 'Lançada no processo errado' from licencas where id = a),
    'a exclusão não registrou quem, quando e o motivo');
  perform pg_temp.recusa(format('select public.admin_excluir_licenca(%L)', a), 'já está na lixeira', 'excluiu duas vezes');
  perform pg_temp.assert((select count(*) from auditoria where registro_id = a and operacao = 'UPDATE' and depois ->> 'excluida_motivo' = 'Lançada no processo errado') = 1,
    'a auditoria não guardou a exclusão');
  perform pg_temp.assert((select count(*) from licencas where id = a) = 1, 'administrador deveria ver a lixeira');
end $$;

-- 3. Fora das listas: gestor, mapa, consulta pública, conflitos.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000c2', true);
do $$
declare a uuid := (select id from ids where nome = 'a'); b uuid := (select id from ids where nome = 'b'); n int;
begin
  perform pg_temp.assert((select count(*) from licencas where id = a) = 0, 'gestor ainda vê a licença excluída');
  update licencas set observacoes = 'tentativa' where id = a;
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'gestor editou licença da lixeira');
  perform pg_temp.assert(not exists (select 1 from jsonb_array_elements(public.obras_publicas()) e where e ->> 'numero' = '801/2026'), 'obras_publicas lista a excluída');
  perform pg_temp.assert(exists (select 1 from jsonb_array_elements(public.obras_publicas()) e where e ->> 'numero' = '802/2026'), 'obras_publicas perdeu a outra licença');
  perform pg_temp.assert(not exists (select 1 from jsonb_array_elements(public.obras_geojson() -> 'features') f where f -> 'properties' ->> 'numero' = '801/2026'), 'geojson lista a excluída');
  perform pg_temp.assert(public.licenca_publica((select codigo_publico from licencas where numero = '802/2026')) is not null, 'consulta pública perdeu a outra');
  -- Conflitos: licença no mesmo ponto não conta se estiver na lixeira.
  perform pg_temp.assert((select count(*) from public.conflitos_de_licenca(b) where licenca_id = a) = 0, 'conflito com licença da lixeira');
end $$;

-- 3b. Consulta pública de licença excluída (como visitante anônimo): nula.
reset role;
select set_config('cadex.test_user_id', '', true);
do $$ begin
  if not exists (select 1 from licencas where numero = '801/2026' and excluida_em is not null) then raise exception 'ASSERT FALHOU: sumiu'; end if;
  insert into ids select 'cod_a', null where false;
end $$;
set local role anon;
do $$
declare cod text;
begin
  -- A página pública de uma licença excluída não existe mais.
  perform pg_temp.assert((select count(*) from jsonb_array_elements(public.obras_publicas()) e where e ->> 'numero' = '801/2026') = 0, 'visitante vê a excluída no mapa');
end $$;
reset role;
set local role cadex_test_app;

-- 4. O número liberado pode ser lançado de novo; restaurar o antigo, então, é recusado.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000c2', true);
do $$
declare
  op uuid := (select id from ids where nome = 'op');
  ter uuid := (select id from empresas where cnpj = '11222333000181');
  trecho jsonb := jsonb_build_array(jsonb_build_object('logradouro', 'Rua Mem de Sá', 'inicio_lat', -22.905, 'inicio_lng', -43.11));
  novo uuid;
begin
  novo := public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','NIT-050120/000801/2026','numero','801/2026',
    'tipo_intervencao','obra','tipos_obra',array['vala'],'escopo','Lançada certo','executora_id',ter,'contratante_id',op,
    'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);
  insert into ids values ('novo', novo);
  -- Mas duas licenças ativas com o mesmo número continuam proibidas.
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','NIT-050120/000899/2026','numero','801/2026',
    'tipos_obra',array['vala'],'escopo','x','executora_id','%s','contratante_id','%s','protocolo_data','2026-09-10'), '[]'::jsonb)$q$, ter, op),
    'licencas_numero_ativo', 'número repetido entre ativas foi aceito');
end $$;

select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000c1', true);
do $$
declare a uuid := (select id from ids where nome = 'a'); novo uuid := (select id from ids where nome = 'novo');
begin
  perform pg_temp.recusa(format('select public.admin_restaurar_licenca(%L)', a), 'outra licença ativa', 'restaurou licença com número já usado');
  perform pg_temp.recusa(format('select public.admin_restaurar_licenca(%L)', novo), 'não está na lixeira', 'restaurou licença que não estava na lixeira');
  -- Excluindo a nova, a antiga volta.
  perform public.admin_excluir_licenca(novo, 'teste');
  perform public.admin_restaurar_licenca(a);
  perform pg_temp.assert((select excluida_em is null and excluida_por is null and excluida_motivo is null from licencas where id = a), 'restauração não limpou a exclusão');
  perform pg_temp.assert(exists (select 1 from jsonb_array_elements(public.obras_publicas()) e where e ->> 'numero' = '801/2026'), 'restaurada não voltou ao mapa');
end $$;

-- 5. Registro legado incompleto também vai à lixeira e volta.
do $$
declare hist uuid := (select id from ids where nome = 'hist');
begin
  perform public.admin_excluir_licenca(hist);
  perform pg_temp.assert((select excluida_em is not null from licencas where id = hist), 'legado não foi para a lixeira');
  perform public.admin_restaurar_licenca(hist);
end $$;

-- 6. Exclusão definitiva: só da lixeira; apaga licença e trechos, não as empresas; a auditoria fica.
do $$
declare
  a uuid := (select id from ids where nome = 'a');
  b uuid := (select id from ids where nome = 'b');
  empresas_antes int := (select count(*) from empresas);
  r jsonb;
begin
  perform pg_temp.recusa(format('select public.admin_excluir_licenca_definitivamente(%L)', b), 'precisa estar na lixeira', 'apagou definitivamente sem passar pela lixeira');
  perform public.admin_excluir_licenca(b, 'engano');
  r := public.admin_excluir_licenca_definitivamente(b);
  perform pg_temp.assert(r ->> 'numero' = '802/2026' and (r ->> 'trechos_apagados')::int = 1, 'resumo da exclusão definitiva errado: ' || r::text);
  perform pg_temp.assert((select count(*) from licencas where id = b) = 0, 'licença continua no banco');
  perform pg_temp.assert((select count(*) from licenca_trechos where licenca_id = b) = 0, 'trechos continuam no banco');
  perform pg_temp.assert((select count(*) from empresas) = empresas_antes, 'a exclusão apagou empresas');
  perform pg_temp.assert((select count(*) from auditoria where registro_id = b and operacao = 'DELETE' and antes ->> 'numero' = '802/2026') = 1,
    'a auditoria não guardou a exclusão definitiva');
  perform pg_temp.assert((select count(*) from licencas where id = a) = 1, 'a exclusão levou outra licença junto');
end $$;

-- 7. CISP não enxerga a lixeira nem exclui.
do $$
declare a uuid := (select id from ids where nome = 'a');
begin
  perform public.admin_excluir_licenca(a, 'só para o teste da consulta');
end $$;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000c3', true);
do $$
declare a uuid := (select id from ids where nome = 'a');
begin
  perform pg_temp.assert((select count(*) from licencas where id = a) = 0, 'CISP vê a lixeira');
  perform pg_temp.recusa(format('select public.admin_excluir_licenca(%L)', a), 'Só o administrador', 'CISP excluiu licença');
end $$;

rollback;
