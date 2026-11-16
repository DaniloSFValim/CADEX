-- =====================================================================
-- CADEX — revisão de pendências das licenças: um aviso pode ser aceito
-- ("OK, está correto") com motivo obrigatório. Aceito, o aviso sai da lista
-- de revisão. Se o dado mudar, o texto do aviso muda e ele volta a aparecer.
--
-- Reversão: remover a tabela (e a tela que a usa).
-- =====================================================================

create table if not exists public.licenca_revisoes (
  id           uuid primary key default gen_random_uuid(),
  licenca_id   uuid not null references public.licencas(id) on delete cascade,
  aviso        text not null check (length(btrim(aviso)) > 0),
  motivo       text not null check (length(btrim(motivo)) between 3 and 500),
  revisado_por uuid default auth.uid(),
  revisado_em  timestamptz not null default now(),
  unique (licenca_id, aviso)
);

alter table public.licenca_revisoes enable row level security;
create policy licenca_revisoes_ler on public.licenca_revisoes for select to authenticated using (public.is_servidor());
create policy licenca_revisoes_aceitar on public.licenca_revisoes for insert to authenticated
  with check (public.is_gestor() and revisado_por = auth.uid());
create policy licenca_revisoes_desfazer on public.licenca_revisoes for delete to authenticated
  using (public.is_gestor());

create trigger zz_auditoria after insert or delete on public.licenca_revisoes
  for each row execute function public.registrar_auditoria();
