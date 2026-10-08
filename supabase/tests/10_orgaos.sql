-- =====================================================================
-- Órgão público contratante e setor viário.
--   - gestor cadastra órgão; licenciador/cisp não;
--   - licença viário com órgão público como contratante (deferida);
--   - órgão que restringe setores não vale fora deles;
--   - só uma contratante por licença (empresa OU órgão).
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
  ('00000000-0000-4000-8000-0000000000a1', 'gestor.org@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'licenciador.org@niteroi.test');
insert into servidores (user_id, nome, papel) values
  ('00000000-0000-4000-8000-0000000000a1', 'Gestor', 'gestor'),
  ('00000000-0000-4000-8000-0000000000a2', 'Licenciador', 'licenciador');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;

create temp table ids (nome text primary key, id uuid);

-- Gestor prepara executora viária e os órgãos.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000a1', true);
do $$
declare exe uuid; semob uuid; geral uuid; gasorg uuid; ope uuid; exetel uuid;
begin
  -- Executora terceirizada do setor viário (setor novo).
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('24144040000175', 'Serttel Viário Ltda.', 'terceirizada', 'v@org.test', '{viario}') returning id into exe;
  -- Executora terceirizada de telecom, para o teste da "só uma contratante".
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('11222333000181', 'Terceirizada Telecom Ltda.', 'terceirizada', 't@org.test', '{telecom}') returning id into exetel;
  -- Operadora (contratante telecom).
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('12345678000195', 'Operadora Org S.A.', 'operadora', 'op@org.test') returning id into ope;

  insert into orgaos_publicos (nome, sigla, esfera, setores)
  values ('Secretaria Municipal de Mobilidade', 'SEMOB', 'municipal', '{viario}') returning id into semob;
  insert into orgaos_publicos (nome, sigla, esfera, setores)
  values ('Governo do Estado', 'GERJ', 'estadual', '{}') returning id into geral;
  insert into orgaos_publicos (nome, sigla, esfera, setores)
  values ('Concessionária Pública de Gás', 'CPG', 'estadual', '{gas}') returning id into gasorg;

  insert into ids values ('exe', exe), ('exetel', exetel), ('ope', ope),
                         ('semob', semob), ('geral', geral), ('gasorg', gasorg);
end $$;

-- Validações como gestor.
do $$
declare exe uuid := (select id from ids where nome = 'exe');
        exetel uuid := (select id from ids where nome = 'exetel');
        ope uuid := (select id from ids where nome = 'ope');
        semob uuid := (select id from ids where nome = 'semob');
        geral uuid := (select id from ids where nome = 'geral');
        gasorg uuid := (select id from ids where nome = 'gasorg');
        lic uuid;
begin
  -- Licença viária com órgão público (SEMOB) como contratante: deferida.
  lic := public.salvar_licenca(jsonb_build_object(
      'setor', 'viario', 'processo_sei', 'NIT-ORG/000001/2026', 'numero', 'LCN-VIA-1', 'tipos_obra', array['recomposicao'],
      'escopo', 'Ciclovia NIT Bike', 'executora_id', exe, 'orgao_contratante_id', semob,
      'protocolo_data', '2026-10-01', 'situacao', 'deferida', 'decisao_data', '2026-10-02',
      'inicio_previsto', '2026-10-05', 'fim_previsto', '2026-11-05'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Av. Teste', 'inicio_lat', -22.9, 'inicio_lng', -43.1)));
  perform pg_temp.assert((select situacao from licencas where id = lic) = 'deferida',
    'licença viária com órgão deveria ser deferida');
  perform pg_temp.assert(
    (select empresas_no_deferimento -> 'contratante' ->> 'orgao' from licencas where id = lic) = 'true'
    and (select empresas_no_deferimento -> 'contratante' ->> 'sigla' from licencas where id = lic) = 'SEMOB',
    'o snapshot deveria guardar o órgão como contratante');

  -- Órgão sem setores (GERJ) vale em qualquer setor.
  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'viario', 'processo_sei', 'NIT-ORG/000002/2026', 'numero', 'LCN-VIA-2', 'tipos_obra', array['recomposicao'],
      'escopo', 'Outro trecho', 'executora_id', exe, 'orgao_contratante_id', geral,
      'protocolo_data', '2026-10-01', 'situacao', 'deferida', 'decisao_data', '2026-10-02',
      'inicio_previsto', '2026-10-05', 'fim_previsto', '2026-11-05'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua B', 'inicio_lat', -22.9, 'inicio_lng', -43.1)));

  -- Órgão restrito a {gas} não vale numa licença viária.
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'viario', 'processo_sei', 'NIT-ORG/000003/2026', 'numero', 'LCN-VIA-3', 'tipos_obra', array['recomposicao'],
      'escopo', 'x', 'executora_id', %L, 'orgao_contratante_id', %L,
      'protocolo_data', '2026-10-01', 'situacao', 'deferida', 'decisao_data', '2026-10-02',
      'inicio_previsto', '2026-10-05', 'fim_previsto', '2026-11-05'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua C', 'inicio_lat', -22.9, 'inicio_lng', -43.1)))$q$, exe, gasorg),
    'não atua no setor', 'órgão restrito a gás não deveria valer em viário');

  -- Só uma contratante: empresa E órgão juntos é recusado (telecom).
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'NIT-ORG/000004/2026', 'numero', 'LCN-TEL-1', 'tipos_obra', array['rede'],
      'escopo', 'x', 'executora_id', %L, 'contratante_id', %L, 'orgao_contratante_id', %L,
      'protocolo_data', '2026-10-01', 'situacao', 'deferida', 'decisao_data', '2026-10-02',
      'inicio_previsto', '2026-10-05', 'fim_previsto', '2026-11-05'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua D', 'inicio_lat', -22.9, 'inicio_lng', -43.1)))$q$, exetel, ope, geral),
    'só uma contratante', 'empresa e órgão juntos deveriam ser recusados');
end $$;

-- Licenciador NÃO cadastra órgão (RLS só do gestor); mas registra licença com órgão.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000a2', true);
do $$
declare exe uuid := (select id from ids where nome = 'exe');
        semob uuid := (select id from ids where nome = 'semob');
begin
  perform pg_temp.recusa(
    $q$insert into orgaos_publicos (nome, esfera) values ('Intruso', 'municipal')$q$,
    null, 'licenciador cadastrou órgão');

  perform public.salvar_licenca(jsonb_build_object(
      'setor', 'viario', 'processo_sei', 'NIT-ORG/000005/2026', 'numero', 'LCN-VIA-5', 'tipos_obra', array['recomposicao'],
      'escopo', 'Trecho do licenciador', 'executora_id', exe, 'orgao_contratante_id', semob,
      'protocolo_data', '2026-10-01', 'situacao', 'deferida', 'decisao_data', '2026-10-02',
      'inicio_previsto', '2026-10-05', 'fim_previsto', '2026-11-05'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua E', 'inicio_lat', -22.9, 'inicio_lng', -43.1)));
end $$;

rollback;
