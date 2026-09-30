-- =====================================================================
-- Administração de contas: só administrador gerencia, ninguém se promove
-- sozinho e o sistema não fica sem administrador por engano.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

-- Executa e exige recusa (qualquer erro que não seja do próprio assert).
create or replace function pg_temp.recusa(p_sql text, p_msg text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERT FALHOU: %', p_msg;
exception
  when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  when others then null;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000021', 'admin@niteroi.test'),
  ('00000000-0000-4000-8000-000000000022', 'gestor@niteroi.test'),
  ('00000000-0000-4000-8000-000000000023', 'novo@niteroi.test');
insert into auth.mfa_factors (user_id, status) values
  ('00000000-0000-4000-8000-000000000021', 'verified'),
  ('00000000-0000-4000-8000-000000000022', 'unverified');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-000000000021', 'Administrador', 'gestor', true),
  ('00000000-0000-4000-8000-000000000022', 'Gestor comum', 'gestor', false);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;

set local role cadex_test_app;

-- ---------------------------------------------------------------------
-- Gestor sem administração: não lista, não promove, não remove
-- ---------------------------------------------------------------------
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000022', true);
do $$
begin
  perform pg_temp.assert(not public.is_administrador(), 'gestor comum passou por administrador');
  perform pg_temp.recusa('select * from public.admin_listar_contas()', 'gestor comum listou as contas');
  perform pg_temp.recusa($q$select public.admin_definir_acesso('00000000-0000-4000-8000-000000000022', 'Eu', 'gestor', true)$q$,
    'gestor comum se promoveu a administrador');
  perform pg_temp.recusa($q$select public.admin_remover_acesso('00000000-0000-4000-8000-000000000021')$q$,
    'gestor comum removeu o administrador');
  perform pg_temp.recusa($q$update public.servidores set administrador = true where user_id = auth.uid()$q$,
    'gestor comum se promoveu gravando direto na tabela');
end $$;

-- ---------------------------------------------------------------------
-- Administrador
-- ---------------------------------------------------------------------
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000021', true);
do $$
begin
  perform pg_temp.assert(public.is_administrador(), 'administrador não reconhecido');
  perform pg_temp.assert((select mfa_ativa from public.admin_listar_contas() where email = 'admin@niteroi.test'),
    'aplicativo confirmado não apareceu como verificação ativa');
  perform pg_temp.assert((select count(*) from public.admin_listar_contas()) = 3,
    'a lista deveria trazer todas as contas, inclusive sem acesso');
  perform pg_temp.assert((select nome is null from public.admin_listar_contas() where email = 'novo@niteroi.test'),
    'conta sem acesso deveria vir sem nome de servidor');

  perform pg_temp.assert((select not mfa_ativa from public.admin_listar_contas() where email = 'gestor@niteroi.test'),
    'conta sem aplicativo apareceu com verificação ativa');

  -- Dar acesso de CISP a quem não tinha
  perform public.admin_definir_acesso('00000000-0000-4000-8000-000000000023', '  Operador Novo ', 'cisp', false);
  perform pg_temp.assert((select papel = 'cisp' and nome = 'Operador Novo' from public.admin_listar_contas()
                          where user_id = '00000000-0000-4000-8000-000000000023'),
    'acesso de CISP não foi concedido');

  -- Promover e rebaixar
  perform public.admin_definir_acesso('00000000-0000-4000-8000-000000000022', 'Gestor comum', 'gestor', true);
  perform pg_temp.assert((select administrador from public.admin_listar_contas() where user_id = '00000000-0000-4000-8000-000000000022'),
    'promoção a administrador não gravou');

  -- Administrador só com perfil gestor (o CISP não passa pelo código do aplicativo)
  perform pg_temp.recusa($q$select public.admin_definir_acesso('00000000-0000-4000-8000-000000000023', 'X', 'cisp', true)$q$,
    'CISP virou administrador');

  -- Perfil inválido e nome vazio
  perform pg_temp.recusa($q$select public.admin_definir_acesso('00000000-0000-4000-8000-000000000023', 'X', 'dono', false)$q$,
    'perfil inexistente foi aceito');
  perform pg_temp.recusa($q$select public.admin_definir_acesso('00000000-0000-4000-8000-000000000023', '  ', 'cisp', false)$q$,
    'nome vazio foi aceito');

  -- Nunca sem administrador por engano
  perform pg_temp.recusa($q$select public.admin_definir_acesso('00000000-0000-4000-8000-000000000021', 'Administrador', 'gestor', false)$q$,
    'administrador tirou a própria administração');
  perform pg_temp.recusa($q$select public.admin_remover_acesso('00000000-0000-4000-8000-000000000021')$q$,
    'administrador removeu o próprio acesso');

  -- Remover acesso de outro
  perform public.admin_remover_acesso('00000000-0000-4000-8000-000000000023');
  perform pg_temp.assert((select papel is null from public.admin_listar_contas() where user_id = '00000000-0000-4000-8000-000000000023'),
    'acesso não foi removido');
end $$;

-- ---------------------------------------------------------------------
-- Só a senha (aal1): administrador e gestor perdem os poderes
-- ---------------------------------------------------------------------
select set_config('cadex.test_aal', 'aal1', true);
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000021', true);
do $$
begin
  perform pg_temp.assert(not public.is_administrador(), 'administrador sem o código do aplicativo passou');
  perform pg_temp.recusa('select * from public.admin_listar_contas()', 'administrador listou contas só com a senha');
  perform pg_temp.assert(not public.is_gestor(), 'gestor sem o código do aplicativo passou');
  perform pg_temp.recusa($q$insert into public.empresas (cnpj, razao_social, tipo, email)
                           values ('11222333000181', 'Só Senha Ltda.', 'operadora', 'x@t.test')$q$,
    'gestor cadastrou empresa só com a senha');
  perform pg_temp.assert(public.is_servidor(), 'servidor deveria continuar consultando só com a senha');
end $$;
select set_config('cadex.test_aal', 'aal2', true);

-- Conferência fora da RLS: o que as funções gravaram de fato.
reset role;
do $$
begin
  perform pg_temp.assert((select administrador from public.servidores where user_id = '00000000-0000-4000-8000-000000000022'),
    'promoção não está na tabela');
  perform pg_temp.assert(not exists (select 1 from public.servidores where user_id = '00000000-0000-4000-8000-000000000023'),
    'remoção não está na tabela');
  perform pg_temp.assert((select administrador from public.servidores where user_id = '00000000-0000-4000-8000-000000000021'),
    'administrador perdeu a administração');
end $$;

-- Visitante sem login não chega nas funções
set local role anon;
do $$
begin
  perform pg_temp.recusa('select * from public.admin_listar_contas()', 'visitante listou as contas');
end $$;

reset role;
rollback;
