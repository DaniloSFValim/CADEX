-- =====================================================================
-- CADEX — vínculos entre terceirizadas e operadoras, e código CADEX
--
-- 1. Uma terceirizada costuma atender mais de uma operadora: o campo
--    único `operadora_id` vira a tabela `vinculos`. Encerrar um vínculo
--    registra a data de fim, sem apagar o histórico.
--
-- 2. Código CADEX, atribuído no cadastro e permanente:
--      CADEX-OPE-2026-0001  operadora de telecomunicações
--      CADEX-TER-2026-0001  terceirizada
--    Numeração própria por tipo, recomeçando a cada ano. Como o tipo
--    está no código, o tipo da empresa não muda depois do cadastro.
--    O formato não vem da Resolução, que não define numeração: é
--    convenção desta Prefeitura.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Vínculos
-- ---------------------------------------------------------------------
create table public.vinculos (
  id              uuid primary key default extensions.gen_random_uuid(),
  operadora_id    uuid not null references public.empresas(id) on delete cascade,
  terceirizada_id uuid not null references public.empresas(id) on delete cascade,
  inicio          date not null default current_date,
  fim             date,
  criado_em       timestamptz not null default now(),
  unique (operadora_id, terceirizada_id),
  check (fim is null or fim >= inicio)
);

create index vinculos_terceirizada_idx on public.vinculos (terceirizada_id);

create or replace function public.vinculos_antes_de_gravar()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.empresas where id = new.operadora_id and tipo = 'operadora') then
    raise exception 'A contratante precisa estar cadastrada como operadora.';
  end if;
  if not exists (select 1 from public.empresas where id = new.terceirizada_id and tipo = 'terceirizada') then
    raise exception 'Só uma terceirizada pode ser vinculada a uma operadora.';
  end if;
  return new;
end;
$$;

create trigger vinculos_antes_de_gravar
  before insert or update on public.vinculos
  for each row execute function public.vinculos_antes_de_gravar();

alter table public.vinculos enable row level security;
revoke all on public.vinculos from anon;
create policy vinculos_servidor on public.vinculos
  for all to authenticated using (public.is_servidor()) with check (public.is_servidor());

-- Vínculos que já existiam no campo antigo.
insert into public.vinculos (operadora_id, terceirizada_id, inicio)
select operadora_id, id, criado_em::date from public.empresas
 where tipo = 'terceirizada' and operadora_id is not null;

-- ---------------------------------------------------------------------
-- Código CADEX
-- ---------------------------------------------------------------------
create table public.sequencias_cadex (
  prefixo text not null,
  ano     int  not null,
  ultimo  int  not null,
  primary key (prefixo, ano)
);

-- Só o sistema mexe na numeração.
alter table public.sequencias_cadex enable row level security;
revoke all on public.sequencias_cadex from anon, authenticated;

create or replace function public.proximo_codigo_cadex(p_tipo text)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_prefixo text := case p_tipo when 'operadora' then 'OPE' when 'terceirizada' then 'TER' end;
  v_ano     int  := extract(year from current_date)::int;
  v_n       int;
begin
  if v_prefixo is null then raise exception 'Tipo de empresa desconhecido: %', p_tipo; end if;
  -- O upsert trava a linha da sequência: dois cadastros simultâneos não
  -- recebem o mesmo número.
  insert into public.sequencias_cadex (prefixo, ano, ultimo) values (v_prefixo, v_ano, 1)
  on conflict (prefixo, ano) do update set ultimo = sequencias_cadex.ultimo + 1
  returning ultimo into v_n;
  return format('CADEX-%s-%s-%s', v_prefixo, v_ano, lpad(v_n::text, 4, '0'));
end;
$$;

revoke execute on function public.proximo_codigo_cadex(text) from public, anon, authenticated;

alter table public.empresas add column codigo_cadex text unique;

-- Empresas que já existiam recebem código na ordem de cadastro.
do $$
declare r record;
begin
  for r in select id, tipo from public.empresas order by criado_em, id loop
    update public.empresas set codigo_cadex = public.proximo_codigo_cadex(r.tipo) where id = r.id;
  end loop;
end $$;

alter table public.empresas alter column codigo_cadex set not null;

-- SECURITY DEFINER porque chama `proximo_codigo_cadex`, que ninguém pode
-- chamar direto: sem isso o gatilho, que roda como quem grava, daria
-- "permission denied" em todo cadastro.
create or replace function public.empresas_antes_de_gravar()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  new.cnpj := regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g');
  new.atualizado_em := now();

  if tg_op = 'INSERT' then
    new.codigo_cadex := public.proximo_codigo_cadex(new.tipo);
  else
    if new.codigo_cadex is distinct from old.codigo_cadex then
      raise exception 'O código CADEX é permanente e não pode ser alterado.';
    end if;
    if new.tipo is distinct from old.tipo then
      raise exception 'O tipo da empresa faz parte do código CADEX e não pode ser alterado.';
    end if;
    if new.cnpj is distinct from old.cnpj then
      raise exception 'O CNPJ é a identidade da empresa e não pode ser alterado.';
    end if;
  end if;

  return new;
end;
$$;

-- O vínculo agora está em `vinculos`.
alter table public.empresas drop column operadora_id;
