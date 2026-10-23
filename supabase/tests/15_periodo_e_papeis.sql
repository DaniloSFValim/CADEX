-- =====================================================================
-- Licenças: "Indeferida" não pode mais ser escolhida (o histórico fica),
-- o período da obra ou serviço é validado e a própria contratante pode
-- ser a executora (mesma empresa, um só cadastro).
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

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f1', 'gestor.papeis@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-0000000000f1', 'Gestor', 'gestor');

create temp table ids (nome text primary key, id uuid);
grant select, insert on ids to public;

-- Linha histórica "indeferida", como poderia existir de antes: criada com o
-- gatilho desligado (só o dono da tabela faz isso; o app não consegue).
do $$
declare op uuid; hist uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Operadora Papeis S.A.', 'OpPapeis', 'operadora', 'p1@p.test') returning id into op;
  insert into ids values ('op', op);
  update empresas set executa_obras = true where id = op;  -- cadastro habilita contratante = executora

  alter table licencas disable trigger licencas_antes_de_gravar;
  insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, protocolo_data, situacao)
  values ('telecom', 'HIST-INDEF-1', array['vala'], 'Histórica indeferida', op, '2024-01-10', 'indeferida')
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
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f1', true);

do $$
declare
  op   uuid := (select id from ids where nome = 'op');
  hist uuid := (select id from ids where nome = 'hist');
  op2  uuid; ter uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('11222333000181', 'Outra Operadora S.A.', 'OutraOp', 'operadora', 'p2@p.test') returning id into op2;
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, setores)
  values ('11444777000161', 'Terceirizada Papeis Ltda.', 'TerPapeis', 'terceirizada', 'p3@p.test', '{telecom}') returning id into ter;

  -- 1. Indeferida: nova licença nasce recusada.
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000501/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id','%s','protocolo_data','2026-09-10','situacao','indeferida'), '[]'::jsonb)$q$, op),
    'não é mais registrada', 'licença nova em "indeferida" foi aceita');

  -- 2. O histórico continua legível e editável sem trocar de situação.
  perform pg_temp.assert((select situacao from licencas where id = hist) = 'indeferida', 'histórico indeferido sumiu');
  update licencas set observacoes = 'Corrigida' where id = hist;
  perform pg_temp.assert((select observacoes from licencas where id = hist) = 'Corrigida',
    'licença já indeferida não aceitou correção de outro campo');
end $$;

do $$
declare
  op  uuid := (select id from ids where nome = 'op');
  op2 uuid := (select id from empresas where cnpj = '11222333000181');
  ter uuid := (select id from empresas where cnpj = '11444777000161');
  trecho jsonb := jsonb_build_array(jsonb_build_object('logradouro', 'Rua Mem de Sá', 'inicio_lat', -22.905, 'inicio_lng', -43.11));
  lic uuid;
begin
  -- 3. em_analise → indeferida é recusado.
  lic := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000502/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id',op,'protocolo_data','2026-09-10','situacao','em_analise'), '[]'::jsonb);
  perform pg_temp.recusa(format('update licencas set situacao = %L where id = %L',
      'indeferida', lic), 'não é mais registrada', 'em análise passou a "indeferida"');

  -- 4. Período da obra ou serviço: fim anterior ao início é recusado.
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000503/2026','numero','503/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id','%s','protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-20','fim_previsto','2026-10-10'), %L::jsonb)$q$, op, trecho::text),
    'O fim da obra ou serviço não pode ser anterior ao início', 'período invertido foi aceito');

  -- 5. A própria contratante executa: mesma empresa nos dois papéis, um só cadastro.
  lic := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000504/2026','numero','504/2026','tipos_obra',array['vala'],'escopo','Vala',
      'executora_id',op,'contratante_id',op,'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);
  perform pg_temp.assert((select contratante_id = executora_id from licencas where id = lic),
    'contratante e executora não ficaram na mesma empresa');
  perform pg_temp.assert((select count(*) from empresas where cnpj = '12345678000195') = 1,
    'a mesma empresa ganhou um segundo cadastro');
  perform pg_temp.assert((select empresas_no_deferimento -> 'contratante' ->> 'id' = empresas_no_deferimento -> 'executora' ->> 'id'
                            from licencas where id = lic), 'foto do deferimento com contratante diferente da executora');

  -- 6. Titular com contratante DIFERENTE continua recusada (a titular executa a própria obra).
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000505/2026','numero','505/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id','%s','contratante_id','%s','protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), %L::jsonb)$q$, op, op2, trecho::text),
    'só se aplica quando a executora é terceirizada', 'titular com outra contratante foi aceita');

  -- 7. Terceirizada não contrata a si mesma.
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000506/2026','numero','506/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id','%s','contratante_id','%s','protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), %L::jsonb)$q$, ter, ter, trecho::text),
    'não pode ser a própria contratante', 'terceirizada como própria contratante foi aceita');

  -- 8. Terceirizada contratada por outra empresa segue normal.
  perform public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000507/2026','numero','507/2026','tipos_obra',array['vala'],'escopo','Vala',
      'executora_id',ter,'contratante_id',op,'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);

  -- 9. A marca "executa obra ou serviço" do cadastro é que habilita contratante = executora.
  perform pg_temp.assert(not (select executa_obras from empresas where id = op2), 'empresa nova nasceu marcada');
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000508/2026','numero','508/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id','%s','contratante_id','%s','protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), %L::jsonb)$q$, op2, op2, trecho::text),
    'não está cadastrada como executora', 'empresa sem a marca foi aceita como contratante e executora');
  -- Também por edição de uma licença existente.
  lic := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000509/2026','numero','509/2026','tipos_obra',array['vala'],'escopo','Vala',
      'executora_id',ter,'contratante_id',op2,'protocolo_data','2026-09-15','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);
  perform pg_temp.recusa(format('update licencas set executora_id = %L where id = %L', op2, lic),
    'não está cadastrada como executora', 'troca para contratante = executora sem a marca foi aceita');
  -- Terceirizada não recebe a marca.
  perform pg_temp.recusa(format('update empresas set executa_obras = true where id = %L', ter),
    'empresas_executa_obras_so_titular', 'terceirizada foi marcada como executora de obra própria');
  -- Com a marca no cadastro, a mesma licença passa.
  update empresas set executa_obras = true where id = op2;
  update licencas set executora_id = op2 where id = lic;
  perform pg_temp.assert((select contratante_id = executora_id from licencas where id = lic), 'não passou com a marca');
  -- Tirar a marca depois não trava a edição de outros campos da licença já registrada.
  update empresas set executa_obras = false where id = op2;
  update licencas set observacoes = 'ajuste' where id = lic;
end $$;

rollback;
