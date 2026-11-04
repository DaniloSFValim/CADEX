-- =====================================================================
-- Dados funcionais do servidor (matrícula e cargo): só o administrador
-- grava; o servidor lê os próprios; a lista de contas traz os dois campos.
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
  when raise_exception or check_violation or insufficient_privilege then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if p_trecho is not null and position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f1', 'admin.dados@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000f2', 'fiscal.dados@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000f3', 'semacesso.dados@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000f1', 'Administrador Dados', 'gestor', true),
  ('00000000-0000-4000-8000-0000000000f2', 'Fiscal Dados', 'gestor', false);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;

-- Fiscal comum: não grava dados de outra conta, nem os próprios pela função
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f2', true);
do $$
begin
  perform pg_temp.recusa($q$select public.admin_definir_dados_funcionais('00000000-0000-4000-8000-0000000000f2', '000.002-0', 'Fiscal')$q$,
    'Só administrador', 'fiscal comum gravou dados funcionais');
  perform pg_temp.recusa($q$update public.servidores set matricula = '000.002-0' where user_id = auth.uid()$q$,
    null, 'fiscal comum gravou matrícula direto na tabela');
end $$;

-- Administrador: grava, recusa campo vazio e conta sem acesso
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f1', true);
do $$
begin
  perform public.admin_definir_dados_funcionais('00000000-0000-4000-8000-0000000000f2', '  000.002-0 ', ' Fiscal de Serviços Concedidos ');

  perform pg_temp.recusa($q$select public.admin_definir_dados_funcionais('00000000-0000-4000-8000-0000000000f2', '  ', 'Fiscal')$q$,
    'Informe a matrícula', 'aceitou matrícula vazia');
  perform pg_temp.recusa($q$select public.admin_definir_dados_funcionais('00000000-0000-4000-8000-0000000000f2', '000.002-0', '')$q$,
    'Informe o cargo', 'aceitou cargo vazio');
  perform pg_temp.recusa($q$select public.admin_definir_dados_funcionais('00000000-0000-4000-8000-0000000000f3', '000.003-0', 'Fiscal')$q$,
    'Conta sem acesso', 'gravou dados numa conta sem acesso ao CADEX');

  perform pg_temp.assert(exists (select 1 from public.admin_listar_contas() c
    where c.user_id = '00000000-0000-4000-8000-0000000000f2' and c.matricula = '000.002-0' and c.cargo = 'Fiscal de Serviços Concedidos'),
    'lista de contas não trouxe matrícula e cargo');
end $$;

-- O próprio servidor lê os seus dados pela RLS
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000f2', true);
do $$
begin
  perform pg_temp.assert(exists (select 1 from servidores where user_id = auth.uid() and matricula = '000.002-0'),
    'servidor não lê a própria matrícula');
end $$;

rollback;
