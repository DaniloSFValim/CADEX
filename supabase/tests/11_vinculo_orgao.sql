-- =====================================================================
-- Vínculo com órgão público como contratante.
--   - órgão → terceirizada vale (ex.: SEMOB contrata a SERTTEL);
--   - só uma contratante por vínculo (empresa OU órgão, não ambos/nenhum);
--   - a consulta pública lista o órgão entre as contratantes.
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
  ('00000000-0000-4000-8000-0000000000b1', 'gestor.vinc@niteroi.test');
insert into servidores (user_id, nome, papel) values
  ('00000000-0000-4000-8000-0000000000b1', 'Gestor', 'gestor');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000b1', true);

create temp table ids (nome text primary key, id uuid);

do $$
declare ter uuid; ope uuid; semob uuid;
begin
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('24144040000175', 'Serttel Viário Ltda.', 'terceirizada', 'te@vinc.test', '{viario}') returning id into ter;
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('12345678000195', 'Operadora Vinc S.A.', 'operadora', 'op@vinc.test') returning id into ope;
  insert into orgaos_publicos (nome, sigla, esfera, setores)
  values ('Secretaria Municipal de Mobilidade', 'SEMOB', 'municipal', '{viario}') returning id into semob;
  insert into ids values ('ter', ter), ('ope', ope), ('semob', semob);
end $$;

do $$
declare ter uuid := (select id from ids where nome = 'ter');
        ope uuid := (select id from ids where nome = 'ope');
        semob uuid := (select id from ids where nome = 'semob');
begin
  -- Órgão público contrata a terceirizada: vínculo válido.
  insert into vinculos (orgao_contratante_id, contratada_id) values (semob, ter);
  perform pg_temp.assert(
    (select count(*) from vinculos where orgao_contratante_id = semob and contratada_id = ter and fim is null) = 1,
    'o vínculo órgão → terceirizada deveria ser gravado');

  -- Empresa E órgão juntos: recusado pela constraint.
  perform pg_temp.recusa(format(
    $q$insert into vinculos (contratante_id, orgao_contratante_id, contratada_id) values (%L, %L, %L)$q$, ope, semob, ter),
    'vinculos_uma_contratante', 'empresa e órgão juntos deveriam ser recusados');

  -- Nenhuma contratante: recusado (o gatilho dispara antes da constraint).
  perform pg_temp.recusa(format(
    $q$insert into vinculos (contratada_id) values (%L)$q$, ter),
    'Informe a contratante', 'vínculo sem contratante deveria ser recusado');

  -- Órgão inexistente: recusado (FK).
  perform pg_temp.recusa(
    $q$insert into vinculos (orgao_contratante_id, contratada_id)
       values ('00000000-0000-4000-8000-0000000000ff', (select id from ids where nome = 'ter'))$q$,
    null, 'órgão inexistente deveria ser recusado');

  -- Contratada não-terceirizada (operadora): recusada pelo gatilho.
  perform pg_temp.recusa(format(
    $q$insert into vinculos (orgao_contratante_id, contratada_id) values (%L, %L)$q$, semob, ope),
    'terceirizada', 'contratada operadora deveria ser recusada');

  -- A consulta pública lista o órgão entre as contratantes da terceirizada.
  perform pg_temp.assert(
    (select 'SEMOB' = any(contratantes) from public.consulta_publica() where codigo_cadex =
       (select codigo_cadex from empresas where id = ter)),
    'a consulta pública deveria listar a SEMOB como contratante');
end $$;

rollback;
