-- =====================================================================
-- CADEX — 00: extensões, tipos, funções utilitárias e núcleo de acesso
-- =====================================================================
-- Fonte normativa: Resolução Conjunta SECONSER/SEOP nº 001/2026.
-- ATENÇÃO: o texto da Resolução NÃO foi fornecido a esta sessão. Todo
-- parâmetro normativo (prazos, validades) está em `system_parameters`,
-- é configurável e está marcado em COMPLIANCE-MATRIX.md como
-- "PENDENTE DE CONFERÊNCIA CONTRA O TEXTO OFICIAL".
-- Nenhum número de artigo foi inventado neste repositório.
-- =====================================================================

-- As extensões NÃO vão para o schema `public`.
-- O `public` é exposto pelo PostgREST (config.toml); PostGIS instalado ali
-- transformaria centenas de funções st_* em endpoints RPC alcançáveis por
-- `anon`. Instalar em `extensions` é também a convenção do Supabase.
create schema if not exists extensions;

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto   with schema extensions;
create extension if not exists postgis    with schema extensions;
create extension if not exists pg_trgm    with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- A partir daqui o DDL precisa enxergar os tipos e operadores das extensões
-- (geometry, geography, gin_trgm_ops, gen_random_bytes). A resolução ocorre
-- no momento do DDL e fica gravada por OID, então tabelas, índices e views
-- continuam corretos independentemente do search_path de quem os usa depois.
set search_path = public, extensions;

create schema if not exists cadex;
comment on schema cadex is 'Funções de domínio e utilitários do CADEX (não expostas via PostgREST).';

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------

create type user_role as enum (
  'admin',              -- 5.1 Administrador do sistema
  'gestor_seconser',    -- 5.2
  'analista_seconser',  -- 5.3
  'fiscal_viario',      -- 5.4
  'guarda_civil',       -- 5.5
  'empresa',            -- 5.6
  'cisp_seop'           -- 5.7
);

-- Situação cadastral do CADEX (§9)
create type cadex_status as enum (
  'rascunho',
  'protocolado',
  'em_analise',
  'pendente',
  'deferido',
  'ativo',
  'proximo_vencimento',
  'inapto',
  'indeferido',
  'cancelado'
);

create type document_status as enum (
  'pendente_envio',
  'em_analise',
  'aprovado',
  'rejeitado',
  'vencido',
  'substituido'
);

-- §12/§13/§16/§18 — três workflows distintos, deliberadamente separados.
create type intervention_kind as enum ('obra', 'manutencao', 'emergencia');

create type license_status as enum (
  'rascunho',
  'protocolada',
  'em_analise',
  'em_diligencia',
  'deferida',
  'indeferida',
  'em_execucao',
  'concluida',
  'vencida',
  'cancelada'
);

create type declaration_status as enum (
  'rascunho',
  'registrada',
  'equipe_em_deslocamento',
  'em_execucao',
  'encerrada',
  'cancelada'
);

create type emergency_status as enum (
  'acionada',
  'em_deslocamento',
  'em_atendimento',
  'aguardando_regularizacao',
  'regularizada',
  'encerrada',
  'fora_do_prazo'
);

create type inspection_result as enum ('conforme', 'nao_conforme', 'nao_aplicavel');

create type as_built_status as enum (
  'solicitado',
  'enviado',
  'em_validacao',
  'reprovado',
  'aprovado',
  'arquivado'
);

create type process_event_kind as enum (
  'protocolo', 'analise', 'diligencia', 'saneamento',
  'deferimento', 'indeferimento', 'cancelamento', 'renovacao', 'observacao'
);

-- ---------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------

create or replace function cadex.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Validação real de CNPJ (dígitos verificadores), não apenas máscara.
create or replace function cadex.is_valid_cnpj(p_cnpj text)
returns boolean language plpgsql immutable as $$
declare
  d text;
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; i int; v1 int; v2 int;
begin
  d := regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g');
  if length(d) <> 14 then return false; end if;
  if d ~ '^(\d)\1{13}$' then return false; end if;

  s := 0;
  for i in 1..12 loop s := s + substr(d,i,1)::int * w1[i]; end loop;
  v1 := 11 - (s % 11);
  if v1 >= 10 then v1 := 0; end if;
  if substr(d,13,1)::int <> v1 then return false; end if;

  s := 0;
  for i in 1..13 loop s := s + substr(d,i,1)::int * w2[i]; end loop;
  v2 := 11 - (s % 11);
  if v2 >= 10 then v2 := 0; end if;
  return substr(d,14,1)::int = v2;
end;
$$;

create or replace function cadex.only_digits(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p,''), '\D', '', 'g');
$$;

-- ---------------------------------------------------------------------
-- Parâmetros do sistema (§31, §47) — nada de prazo hard-coded no código
-- ---------------------------------------------------------------------

create table system_parameters (
  key           text primary key,
  value         jsonb not null,
  description   text not null,
  unit          text,
  legal_basis   text,        -- artigo da Resolução; NULL = pendente de conferência
  editable      boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
comment on table system_parameters is
  'Parâmetros normativos configuráveis. legal_basis NULL significa que o artigo
   ainda não foi conferido contra o texto oficial da Resolução.';

create trigger trg_system_parameters_touch
  before update on system_parameters
  for each row execute function cadex.touch_updated_at();

-- Calendário de feriados (§31: "não codificar feriados no frontend")
create table holidays (
  id          uuid primary key default uuid_generate_v4(),
  date        date not null,
  name        text not null,
  scope       text not null default 'municipal'
                check (scope in ('nacional','estadual','municipal')),
  recurring   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (date, scope)
);

-- Dias úteis a partir do calendário persistido.
create or replace function cadex.add_business_days(p_start date, p_days int)
returns date language plpgsql stable as $$
declare
  d date := p_start;
  remaining int := p_days;
begin
  while remaining > 0 loop
    d := d + 1;
    if extract(isodow from d) < 6
       and not exists (
         select 1 from holidays h
         where h.date = d
            or (h.recurring
                and to_char(h.date,'MM-DD') = to_char(d,'MM-DD'))
       )
    then
      remaining := remaining - 1;
    end if;
  end loop;
  return d;
end;
$$;

create or replace function cadex.business_days_between(p_from date, p_to date)
returns int language plpgsql stable as $$
declare d date := p_from; n int := 0;
begin
  while d < p_to loop
    d := d + 1;
    if extract(isodow from d) < 6
       and not exists (
         select 1 from holidays h
         where h.date = d
            or (h.recurring and to_char(h.date,'MM-DD') = to_char(d,'MM-DD'))
       )
    then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

create or replace function cadex.param_int(p_key text)
returns int language sql stable as $$
  select (value->>'value')::int from system_parameters where key = p_key;
$$;

-- ---------------------------------------------------------------------
-- Usuários e RBAC (§5, §35)
-- ---------------------------------------------------------------------

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  cpf          text,
  email        text not null,
  phone        text,
  org_unit     text,                  -- SECONSER, SEOP/CISP, GCM...
  company_id   uuid,                  -- FK adicionada em 01 (empresas)
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_profiles_touch
  before update on profiles
  for each row execute function cadex.touch_updated_at();

-- Um usuário pode acumular papéis (ex.: analista que também fiscaliza).
create table user_roles (
  user_id     uuid not null references profiles(id) on delete cascade,
  role        user_role not null,
  granted_by  uuid references profiles(id),
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);

-- SECURITY DEFINER: as policies de RLS consultam user_roles, que por sua vez
-- tem RLS. Sem definer isso recursa.
create or replace function cadex.has_role(p_role user_role)
returns boolean language sql stable security definer set search_path = public, cadex, extensions as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid() and ur.role = p_role
  );
$$;

create or replace function cadex.has_any_role(p_roles user_role[])
returns boolean language sql stable security definer set search_path = public, cadex, extensions as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid() and ur.role = any(p_roles)
  );
$$;

create or replace function cadex.is_staff()
returns boolean language sql stable security definer set search_path = public, cadex, extensions as $$
  select cadex.has_any_role(array[
    'admin','gestor_seconser','analista_seconser','fiscal_viario','guarda_civil','cisp_seop'
  ]::user_role[]);
$$;

-- Empresa do usuário logado (perfil 5.6).
create or replace function cadex.current_company_id()
returns uuid language sql stable security definer set search_path = public, cadex, extensions as $$
  select company_id from profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Auditoria (§33) — append-only
-- ---------------------------------------------------------------------

create table audit_logs (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references profiles(id),
  actor_label   text,
  action        text not null,          -- INSERT | UPDATE | DELETE | custom
  entity        text not null,
  entity_id     text,
  old_value     jsonb,
  new_value     jsonb,
  ip_address    inet,
  note          text
);

create index idx_audit_entity on audit_logs (entity, entity_id, occurred_at desc);
create index idx_audit_actor  on audit_logs (actor_id, occurred_at desc);

-- Trigger genérico de auditoria, aplicado às tabelas sensíveis em 04.
create or replace function cadex.audit_row()
returns trigger language plpgsql security definer set search_path = public, cadex, extensions as $$
declare
  v_old jsonb; v_new jsonb; v_id text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_new := null; v_id := (to_jsonb(old)->>'id');
  elsif tg_op = 'INSERT' then
    v_old := null; v_new := to_jsonb(new); v_id := (to_jsonb(new)->>'id');
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := (to_jsonb(new)->>'id');
    if v_old = v_new then return new; end if;
  end if;

  insert into audit_logs (actor_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(), tg_op, tg_table_name, v_id, v_old, v_new);

  return coalesce(new, old);
end;
$$;

-- Auditoria é imutável para todos: sem UPDATE, sem DELETE (nem para admin).
create or replace function cadex.block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Registros de auditoria são imutáveis (§33).';
end;
$$;

create trigger trg_audit_immutable
  before update or delete on audit_logs
  for each row execute function cadex.block_mutation();
