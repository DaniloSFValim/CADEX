-- =====================================================================
-- Mapa-base do mapa público escolhido pela Administração.
--  - Uma linha só (id = true), com a camada escolhida: 'topo' (padrão, o
--    atual) ou 'ruas'. Sem acesso direto: leitura e escrita só por função.
--  - Leitura pública (anon) por mapa_base_publico(): só devolve a camada.
--  - Escrita só por definir_mapa_base(), que confere is_administrador()
--    (inclui aal2, o mesmo critério das demais telas da Administração).
-- =====================================================================

create table if not exists public.configuracao_mapa (
  id boolean primary key default true check (id),
  camada text not null default 'topo' check (camada in ('topo', 'ruas')),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

insert into public.configuracao_mapa (id) values (true) on conflict (id) do nothing;

alter table public.configuracao_mapa enable row level security;
revoke all on public.configuracao_mapa from public, anon, authenticated;

create or replace function public.mapa_base_publico()
returns text
language sql stable security definer
set search_path = public
as $$
  select camada from public.configuracao_mapa where id;
$$;

revoke execute on function public.mapa_base_publico() from public;
grant execute on function public.mapa_base_publico() to anon, authenticated;

create or replace function public.definir_mapa_base(p_camada text)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_administrador() then
    raise exception 'Sem permissão para alterar o mapa público.' using errcode = '42501';
  end if;
  if p_camada not in ('topo', 'ruas') then
    raise exception 'Camada de mapa inválida.' using errcode = '22023';
  end if;
  update public.configuracao_mapa
     set camada = p_camada, atualizado_em = now(), atualizado_por = auth.uid()
   where id;
  return p_camada;
end;
$$;

revoke execute on function public.definir_mapa_base(text) from public, anon;
grant execute on function public.definir_mapa_base(text) to authenticated;
