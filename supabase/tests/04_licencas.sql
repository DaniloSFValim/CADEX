-- =====================================================================
-- Licenças de obra: processo SEI, partes, trechos, deferimento só com
-- empresas APTAS, conclusão/As Built e acesso (gestor grava, CISP lê).
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

-- Executa e exige recusa com a mensagem esperada.
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
  ('00000000-0000-4000-8000-000000000041', 'gestor.lic@niteroi.test'),
  ('00000000-0000-4000-8000-000000000042', 'cisp.lic@niteroi.test');
insert into servidores (user_id, nome, papel) values
  ('00000000-0000-4000-8000-000000000041', 'Gestor', 'gestor'),
  ('00000000-0000-4000-8000-000000000042', 'CISP', 'cisp');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;

set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000041', true);

create temp table ids (nome text primary key, id uuid);

do $$
declare op uuid; te uuid; sub uuid; rt uuid; lic uuid;
begin
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('12345678000195', 'Operadora Licença S.A.', 'operadora', 'op@l.test') returning id into op;
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('98765432000198', 'Executora Licença Ltda.', 'terceirizada', 'te@l.test', '{telecom}') returning id into te;
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('11444777000161', 'Subcontratada Licença Ltda.', 'terceirizada', 'sub@l.test', '{telecom}') returning id into sub;
  insert into vinculos (contratante_id, contratada_id) values (op, te);
  insert into responsaveis_tecnicos (empresa_id, nome, cpf, conselho, registro_numero)
  values (te, 'Eng. Fulano', '52998224725', 'CREA', 'RJ-123') returning id into rt;
  insert into ids values ('op', op), ('te', te), ('sub', sub), ('rt', rt);

  -- Documentos obrigatórios entregues: pré-requisito para tornar APTA.
  insert into documentos (empresa_id, tipo, status)
  select e.id, t.codigo, 'entregue' from empresas e join tipos_documento t
    on t.obrigatorio and public.perfil_documental(e.tipo, e.setores) = any(t.perfis)
   where e.id in (te, sub);

  -- Processo SEI no formato do setor licenciador
  -- Processo em texto livre (SEI ou numeração anterior), mas não vazio
  perform pg_temp.recusa(format($q$insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, protocolo_data)
    values ('telecom', '   ', '{vala}', 'x', %L, %L, '2026-09-01')$q$, te, op),
    'licencas_processo_check', 'aceitou processo vazio');

  -- Terceirizada sem concessionária contratante
  perform pg_temp.recusa(format($q$insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, protocolo_data)
    values ('telecom', 'NIT-050120/000123/2026', '{vala}', 'x', %L, '2026-09-01')$q$, te),
    'informe a concessionária', 'aceitou terceirizada sem contratante');

  -- Tipo de obra fora do art. 10
  perform pg_temp.recusa(format($q$insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, protocolo_data)
    values ('telecom', 'NIT-050120/000123/2026', '{pintura}', 'x', %L, %L, '2026-09-01')$q$, te, op),
    'licencas_tipos_obra_check', 'aceitou tipo de obra fora do art. 10');

  -- Subcontratada sem vínculo com a executora
  perform pg_temp.recusa(format($q$insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, subcontratada_id, protocolo_data)
    values ('telecom', 'NIT-050120/000123/2026', '{vala}', 'x', %L, %L, %L, '2026-09-01')$q$, te, op, sub),
    'vínculo ativo', 'aceitou subcontratada sem vínculo');
  insert into vinculos (contratante_id, contratada_id) values (te, sub);

  -- Pedido válido, em análise; processo normalizado para maiúsculas
  insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, subcontratada_id,
                        responsavel_tecnico_id, protocolo_data)
  values ('telecom', ' nit-050120/000123/2026 ', '{vala,rede}', 'Expansão de rede em vala', te, op, sub, rt, '2026-09-01')
  returning id into lic;
  insert into ids values ('lic', lic);
  perform pg_temp.assert((select processo_sei from licencas where id = lic) = 'NIT-050120/000123/2026',
    'processo SEI não normalizado');

  perform pg_temp.recusa(format($q$insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, protocolo_data)
    values ('telecom', 'NIT-050120/000123/2026', '{vala}', 'x', %L, %L, '2026-09-01')$q$, te, op),
    'licencas_processo_sei_key', 'aceitou processo SEI repetido');

  -- Trecho com latitude e longitude trocadas
  perform pg_temp.recusa(format($q$insert into licenca_trechos (licenca_id, logradouro, inicio_lat, inicio_lng)
    values (%L, 'Rua A', -43.1, -22.9)$q$, lic),
    'licenca_trechos_inicio_lat_check', 'aceitou coordenada fora de Niterói');
end $$;

-- ---------------------------------------------------------------------
-- Deferimento
-- ---------------------------------------------------------------------
do $$
declare lic uuid := (select id from ids where nome = 'lic');
        te uuid := (select id from ids where nome = 'te');
        sub uuid := (select id from ids where nome = 'sub');
        op uuid := (select id from ids where nome = 'op');
begin
  perform pg_temp.recusa(format($q$update licencas set situacao = 'deferida', decisao_data = '2026-09-20',
      numero = 'LIC 001/2026', art_numero = 'ART-1', inicio_previsto = '2026-10-01', fim_previsto = '2026-12-31'
    where id = %L$q$, lic), 'ao menos um trecho', 'deferiu sem trecho');

  insert into licenca_trechos (licenca_id, logradouro, bairro, inicio_lat, inicio_lng, fim_lat, fim_lng)
  values (lic, 'Rua Visconde de Sepetiba', 'Centro', -22.8950, -43.1230, -22.8970, -43.1200);

  perform pg_temp.recusa(format($q$update licencas set situacao = 'deferida', decisao_data = '2026-09-20',
      art_numero = 'ART-1', inicio_previsto = '2026-10-01', fim_previsto = '2026-12-31'
    where id = %L$q$, lic), 'número da licença', 'deferiu sem número');

  perform pg_temp.recusa(format($q$update licencas set situacao = 'deferida', decisao_data = '2026-09-20',
      numero = 'LIC 001/2026', art_numero = 'ART-1', inicio_previsto = '2026-12-31', fim_previsto = '2026-10-01'
    where id = %L$q$, lic), 'fim do cronograma', 'aceitou cronograma invertido');

  -- Empresas em análise: bloqueado (arts. 4º e 8º, § 2º)
  perform pg_temp.recusa(format($q$update licencas set situacao = 'deferida', decisao_data = '2026-09-20',
      numero = 'LIC 001/2026', art_numero = 'ART-1', inicio_previsto = '2026-10-01', fim_previsto = '2026-12-31'
    where id = %L$q$, lic), 'executora não está APTA', 'deferiu com executora em análise');

  update empresas set situacao = 'apta', portaria_numero = 'P-1', portaria_data = current_date - 10 where id = te;
  perform pg_temp.recusa(format($q$update licencas set situacao = 'deferida', decisao_data = '2026-09-20',
      numero = 'LIC 001/2026', art_numero = 'ART-1', inicio_previsto = '2026-10-01', fim_previsto = '2026-12-31'
    where id = %L$q$, lic), 'subcontratada não está APTA', 'deferiu com subcontratada em análise');

  update empresas set situacao = 'apta', portaria_numero = 'P-2', portaria_data = current_date - 10 where id = sub;
  update licencas set situacao = 'deferida', decisao_data = '2026-09-20', numero = 'LIC 001/2026',
         art_numero = 'ART-1', inicio_previsto = '2026-10-01', fim_previsto = '2026-12-31'
   where id = lic;

  perform pg_temp.assert((select empresas_no_deferimento -> 'executora' ->> 'situacao' from licencas where id = lic) = 'apta',
    'não congelou a situação da executora');
  perform pg_temp.assert((select empresas_no_deferimento -> 'contratante' ->> 'razao_social' from licencas where id = lic)
    = 'Operadora Licença S.A.', 'não congelou a contratante');

  -- Congelado: a empresa muda depois, a licença guarda como era
  update empresas set situacao = 'em_saneamento', notificacao_data = current_date where id = te;
  perform pg_temp.assert((select empresas_no_deferimento -> 'executora' ->> 'situacao' from licencas where id = lic) = 'apta',
    'foto do deferimento mudou com a empresa');

  perform pg_temp.recusa(format($q$insert into licencas (setor, processo_sei, numero, tipos_obra, escopo, executora_id, contratante_id, protocolo_data)
    values ('telecom', 'NIT-050120/000999/2026', 'LIC 001/2026', '{poste}', 'x', %L, %L, '2026-09-01')$q$, te, op),
    'licencas_numero_key', 'aceitou número de licença repetido');

  perform pg_temp.recusa(format($q$update licencas set situacao = 'em_analise' where id = %L$q$, lic),
    'só pode ser cancelada', 'deferida voltou para análise');

  perform pg_temp.recusa(format($q$delete from licenca_trechos where licenca_id = %L$q$, lic),
    'ao menos um trecho', 'deferida ficou sem trecho');

  -- Conclusão e As Built (art. 26)
  perform pg_temp.recusa(format($q$update licencas set as_built_sei = '123', as_built_data = '2026-12-20' where id = %L$q$, lic),
    'conclusão da obra antes', 'aceitou As Built sem conclusão');
  update licencas set concluida_em = '2026-12-15' where id = lic;
  perform pg_temp.recusa(format($q$update licencas set as_built_sei = '123' where id = %L$q$, lic),
    'documento e a data', 'aceitou As Built sem data');
  update licencas set as_built_sei = '123', as_built_data = '2026-12-20' where id = lic;

  perform pg_temp.assert((select count(*) from auditoria where tabela = 'licencas' and registro_id = lic) >= 3,
    'alterações da licença sem auditoria');
  perform pg_temp.assert((select te = any(empresas) and op = any(empresas) and sub = any(empresas)
                            from auditoria where tabela = 'licencas' and registro_id = lic and operacao = 'INSERT'),
    'auditoria da licença sem as empresas');
end $$;

-- ---------------------------------------------------------------------
-- salvar_licenca: licença e trechos numa só transação
-- ---------------------------------------------------------------------
do $$
declare te uuid := (select id from ids where nome = 'te');
        op uuid := (select id from ids where nome = 'op');
        lic uuid;
        t1 uuid;
begin
  -- Nova e já deferida numa chamada (executora em saneamento continua apta)
  lic := public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'NIT-050120/000200/2026', 'numero', 'LIC 002/2026', 'tipos_obra', array['poste'],
      'escopo', 'Implantação de poste', 'executora_id', te, 'contratante_id', op, 'art_numero', 'ART-2',
      'protocolo_data', '2026-09-02', 'situacao', 'deferida', 'decisao_data', '2026-09-25',
      'inicio_previsto', '2026-10-05', 'fim_previsto', '2026-10-10'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Av. Amaral Peixoto', 'bairro', 'Centro',
      'inicio_lat', -22.8940, 'inicio_lng', -43.1180)));
  perform pg_temp.assert((select situacao from licencas where id = lic) = 'deferida', 'RPC não deferiu');
  perform pg_temp.assert((select count(*) from licenca_trechos where licenca_id = lic and fim_lat is null) = 1,
    'RPC não gravou o trecho pontual');

  -- Troca de trechos: mantém um, inclui outro, remove o que saiu da lista
  t1 := (select id from licenca_trechos where licenca_id = lic);
  perform public.salvar_licenca(
    (select to_jsonb(l) from licencas l where id = lic),
    jsonb_build_array(
      jsonb_build_object('logradouro', 'Rua Nova', 'inicio_lat', -22.90, 'inicio_lng', -43.11)));
  perform pg_temp.assert((select count(*) from licenca_trechos where licenca_id = lic) = 1
                         and not exists (select 1 from licenca_trechos where id = t1),
    'RPC não substituiu os trechos');

  -- Falha no trecho desfaz a licença inteira
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'NIT-050120/000300/2026', 'tipos_obra', array['vala'], 'escopo', 'x',
      'executora_id', %L, 'contratante_id', %L, 'protocolo_data', '2026-09-03'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua X', 'inicio_lat', 10, 'inicio_lng', 10)))$q$, te, op),
    'licenca_trechos_inicio_lat_check', 'RPC aceitou trecho fora de Niterói');
  perform pg_temp.assert(not exists (select 1 from licencas where processo_sei = 'NIT-050120/000300/2026'),
    'RPC deixou licença pela metade');
end $$;

-- ---------------------------------------------------------------------
-- CISP lê, não grava
-- ---------------------------------------------------------------------
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000042', true);
do $$
declare lic uuid := (select id from ids where nome = 'lic');
begin
  perform pg_temp.assert((select count(*) from licencas where id = lic) = 1, 'CISP não vê a licença');
  perform pg_temp.assert((select count(*) from licenca_trechos where licenca_id = lic) = 1, 'CISP não vê o trecho');
  update licencas set escopo = 'alterado pelo CISP' where id = lic;
  perform pg_temp.assert((select escopo from licencas where id = lic) <> 'alterado pelo CISP', 'CISP alterou a licença');
  perform pg_temp.recusa(format($q$insert into licenca_trechos (licenca_id, logradouro, inicio_lat, inicio_lng)
    values (%L, 'Rua B', -22.9, -43.1)$q$, lic), null, 'CISP incluiu trecho');
end $$;

-- Gestor sem o código do aplicativo (aal1) não grava
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000041', true);
select set_config('cadex.test_aal', 'aal1', true);
do $$
declare lic uuid := (select id from ids where nome = 'lic');
begin
  update licencas set escopo = 'sem MFA' where id = lic;
  perform pg_temp.assert(not exists (select 1 from licencas where escopo = 'sem MFA'), 'gestor sem MFA alterou');
end $$;

-- Público: nada
reset role;
set local role anon;
do $$
begin
  perform pg_temp.recusa('select * from public.licencas', null, 'anônimo leu licenças');
end $$;

rollback;
