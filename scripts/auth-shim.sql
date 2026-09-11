-- =====================================================================
-- Shim do schema `auth` para testes locais SEM Supabase.
-- NÃO é aplicado em produção: em produção o Supabase já provê
-- auth.users, auth.uid() e os papéis anon/authenticated.
-- Este arquivo existe apenas para permitir rodar as migrations e os
-- testes de regras de negócio num Postgres puro (ver scripts/test-db.sh).
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Em produção auth.uid() lê o JWT. No shim, lê um GUC de sessão,
-- o que permite aos testes "logar" como qualquer usuário.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('cadex.test_user_id', true), '')::uuid;
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

-- Helper usado pelos testes para trocar de usuário.
create or replace function auth.login(p_user_id uuid)
returns void language sql as $$
  select set_config('cadex.test_user_id', coalesce(p_user_id::text, ''), false);
$$;
