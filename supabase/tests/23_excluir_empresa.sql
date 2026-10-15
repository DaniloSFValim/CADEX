-- =====================================================================
-- Exclusão de empresa: quem pode, o que bloqueia, e o que sai junto.
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
  when raise_exception or check_violation or unique_violation or insufficient_privilege or not_null_violation or no_data_found then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if p_trecho is not null and position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
grant anon to cadex_test_app;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'gestor.exc@niteroi.test'),
  ('00000000-0000-4000-8000-000000000002', 'admin.exc@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-000000000001', 'Gestor', 'gestor', false),
  ('00000000-0000-4000-8000-000000000002', 'Admin', 'gestor', true);

create temp table ids (nome text primary key, id uuid);
grant select, insert on ids to public;

-- Cadastros (como dono da tabela).
do $$
declare em_analise uuid; habilitada uuid; desativada uuid; com_licenca uuid; org uuid;
begin
  alter table empresas disable trigger user;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('12345678000195', 'Em Análise EXC Ltda.', 'terceirizada', 'a@exc.test', '{telecom}', false, 'em_analise', true, 'CADEX-EXC-0001')
  returning id into em_analise;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('11222333000181', 'Habilitada EXC S.A.', 'operadora', 'h@exc.test', '{telecom}', true, 'deferida', true, 'CADEX-EXC-0002')
  returning id into habilitada;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('24144040000175', 'Desativada EXC Ltda.', 'operadora', 'd@exc.test', '{telecom}', true, 'deferida', false, 'CADEX-EXC-0003')
  returning id into desativada;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('02533755000187', 'Com Licença EXC S.A.', 'operadora', 'c@exc.test', '{telecom}', true, 'deferida', false, 'CADEX-EXC-0004')
  returning id into com_licenca;
  insert into orgaos_publicos (nome, sigla, esfera, natureza, setores)
  values ('Órgão EXC', 'OEXC', 'municipal', 'administracao_direta', '{}') returning id into org;

  alter table empresas enable trigger user;
  alter table licencas disable trigger user;
  insert into licencas (setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, protocolo_data, situacao, decisao_data,
                        inicio_previsto, fim_previsto)
  values ('telecom', 'LIC-EXC-1', array['vala'], 'Licença que prende a empresa', com_licenca, com_licenca, '2026-09-10',
          'deferida', '2026-09-15', '2026-10-01', '2026-10-30');
  alter table licencas enable trigger user;

  insert into ids values ('em_analise', em_analise), ('habilitada', habilitada), ('desativada', desativada),
                         ('com_licenca', com_licenca);
end $$;

-- 1. Gestor (não administrador) não exclui, nem empresa em análise.
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000001', true);
  perform pg_temp.recusa(format('select admin_excluir_empresa(%L)', (select id from ids where nome = 'em_analise')),
    'Só administrador', 'gestor excluiu empresa');
  reset role;
  perform pg_temp.assert(exists (select 1 from empresas where id = (select id from ids where nome = 'em_analise')),
    'gestor apagou a empresa');
end $$;

-- 2. Administrador: empresa habilitada e ativa não é excluída (desative antes).
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000002', true);
  perform pg_temp.recusa(format('select admin_excluir_empresa(%L)', (select id from ids where nome = 'habilitada')),
    'Desative o cadastro', 'empresa habilitada e ativa foi excluída');
  reset role;
end $$;

-- 3. Empresa com licença não é excluída, mesmo desativada.
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000002', true);
  perform pg_temp.recusa(format('select admin_excluir_empresa(%L)', (select id from ids where nome = 'com_licenca')),
    'tem licença', 'empresa com licença foi excluída');
  reset role;
  perform pg_temp.assert(exists (select 1 from empresas where id = (select id from ids where nome = 'com_licenca')),
    'empresa com licença sumiu');
end $$;

-- 4. Administrador: empresa em análise (sem vínculo) é excluída, sem desativar antes.
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000002', true);
  perform admin_excluir_empresa((select id from ids where nome = 'em_analise'));
  reset role;
  perform pg_temp.assert(not exists (select 1 from empresas where id = (select id from ids where nome = 'em_analise')),
    'empresa em análise não foi excluída');
end $$;

-- 5. Administrador: empresa desativada e sem licença é excluída.
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000002', true);
  perform admin_excluir_empresa((select id from ids where nome = 'desativada'));
  reset role;
  perform pg_temp.assert(not exists (select 1 from empresas where id = (select id from ids where nome = 'desativada')),
    'empresa desativada não foi excluída');
end $$;

-- 6. A exclusão fica na auditoria, com a empresa como estava.
do $$
begin
  perform pg_temp.assert(exists (
    select 1 from auditoria where tabela = 'empresas' and upper(operacao) = 'DELETE'
      and antes ->> 'razao_social' = 'Em Análise EXC Ltda.'),
    'exclusão não foi auditada');
end $$;

-- 7. Empresa inexistente: erro claro.
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000002', true);
  perform pg_temp.recusa(format('select admin_excluir_empresa(%L)', '00000000-0000-4000-8000-00000000ffff'),
    'não encontrada', 'empresa inexistente aceita');
  reset role;
end $$;

rollback;
