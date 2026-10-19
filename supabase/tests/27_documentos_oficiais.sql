-- =====================================================================
-- Documentos oficiais: numeração sequencial, só o gestor emite, registro
-- imutável e código de verificação recalculável.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

create or replace function pg_temp.recusa(p_sql text, p_msg text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERT FALHOU: %', p_msg;
exception
  when others then
    -- A falha do próprio teste não pode ser engolida pela recusa esperada.
    if sqlerrm like 'ASSERT FALHOU%' then raise; end if;
end;
$$;

insert into empresas (cnpj, razao_social, tipo, email, cidade, uf)
values ('11.222.333/0001-81', 'Operadora Documento S.A.', 'operadora', 'doc@t.test', 'Niterói', 'RJ');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
grant select, insert, update on documentos_numeracao to cadex_test_app;
grant usage on schema public to cadex_test_app;
grant select on empresas, servidores to cadex_test_app;

-- Um gestor (user 1) e um usuário comum (user ff), este sem papel de servidor.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'gestor.doc@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000ff', 'comum.doc@exemplo.test');
insert into servidores (user_id, nome, papel)
  values ('00000000-0000-4000-8000-000000000001', 'Gestor Documentos', 'gestor');

-- ---------------------------------------------------------------------
-- Gestor emite: a numeração começa em 1 e não repete
-- ---------------------------------------------------------------------
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000001', true);

do $$
declare
  emp uuid := (select id from empresas where cnpj = '11222333000181');
  a record;
  b record;
begin
  select * into a from emitir_documento('notificacao', emp, '{"prazo_dias": 15}'::jsonb);
  select * into b from emitir_documento('apreensao', emp, '{"bens": "2 caixas"}'::jsonb);

  perform pg_temp.assert(a.numero = 1, 'primeiro documento deveria ser o nº 1, veio ' || a.numero);
  perform pg_temp.assert(b.numero = 2, 'segundo documento deveria ser o nº 2, veio ' || b.numero);
  perform pg_temp.assert(a.codigo_verificacao <> b.codigo_verificacao, 'códigos de verificação repetidos');
  perform pg_temp.assert(length(a.codigo_verificacao) = 12, 'código de verificação deveria ter 12 caracteres');
end;
$$;

-- Tipo desconhecido e dados que não são objeto são recusados
select pg_temp.recusa(
  format('select * from emitir_documento(%L, %L, %L)', 'alvara', (select id from empresas where cnpj = '11222333000181'), '{}'),
  'tipo desconhecido deveria ser recusado');
select pg_temp.recusa(
  format('select * from emitir_documento(%L, %L, %L)', 'embargo', (select id from empresas where cnpj = '11222333000181'), '[1,2]'),
  'dados em lista deveriam ser recusados');

-- O número não avança quando a emissão é recusada
reset role;
select pg_temp.assert((select ultimo from documentos_numeracao where id = 1) = 2,
  'emissão recusada não pode consumir número');

-- ---------------------------------------------------------------------
-- Quem não é gestor não emite
-- ---------------------------------------------------------------------
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000ff', true);
select pg_temp.recusa(
  format('select * from emitir_documento(%L, %L, %L)', 'embargo', (select id from empresas where cnpj = '11222333000181'), '{}'),
  'usuário sem papel de gestor não pode emitir');
reset role;

-- ---------------------------------------------------------------------
-- Registro imutável: nem o dono do banco altera ou apaga
-- ---------------------------------------------------------------------
select pg_temp.recusa(
  'update documentos_oficiais set tipo = ''embargo''',
  'documento emitido não pode ser alterado');
select pg_temp.recusa(
  'delete from documentos_oficiais',
  'documento emitido não pode ser apagado');

-- A emissão fica na auditoria da empresa
select pg_temp.assert((select count(*) from auditoria
  where tabela = 'documentos_oficiais' and operacao = 'INSERT') = 2,
  'cada emissão deveria gerar um registro de auditoria');

rollback;
