-- =====================================================================
-- Shim do schema `auth` para testes locais SEM Supabase.
-- NÃO é aplicado em produção: em produção o Supabase já provê
-- auth.users, auth.uid() e os papéis anon/authenticated.
-- Este arquivo existe apenas para permitir rodar as migrations e os
-- testes de regras de negócio num Postgres puro (ver scripts/test-db.sh).
-- =====================================================================

-- Espelha a convenção de produção: extensões fora do `public`.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

create schema if not exists auth;

create table if not exists auth.users (
  id              uuid primary key default extensions.gen_random_uuid(),
  email           text unique,
  created_at      timestamptz default now(),
  last_sign_in_at timestamptz
);

-- Em produção auth.uid() lê o JWT. No shim, lê um GUC de sessão,
-- o que permite aos testes "logar" como qualquer usuário.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('cadex.test_user_id', true), '')::uuid;
$$;

-- Em produção auth.jwt() devolve o token. No shim, só o nível de
-- autenticação (aal): aal2 por padrão (gestor que confirmou o código do
-- aplicativo); os testes trocam para aal1 com o GUC cadex.test_aal.
create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select jsonb_build_object('aal', coalesce(nullif(current_setting('cadex.test_aal', true), ''), 'aal2'));
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- Como no Supabase: os papéis do app enxergam os schemas auth e extensions.
grant usage on schema auth, extensions to anon, authenticated;

-- Helper usado pelos testes para trocar de usuário.
create or replace function auth.login(p_user_id uuid)
returns void language sql as $$
  select set_config('cadex.test_user_id', coalesce(p_user_id::text, ''), false);
$$;

-- Reproduz o comportamento do Supabase: por padrão, toda tabela criada no
-- schema `public` nasce acessível a `anon` e `authenticated`. Sem isto, o
-- teste local validaria um ambiente mais restritivo do que a produção.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
