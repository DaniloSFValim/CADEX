-- =====================================================================
-- Licença emitida no sistema anterior: marca a licença que já foi emitida
-- fora do CADEX, para o CADEX não emitir o documento oficial de novo.
-- Quem altera é quem grava licenças (gestor ou licenciador, pela RLS que já
-- existe); a função não ganha permissão extra.
-- =====================================================================

alter table public.licencas
  add column if not exists emitida_em_sistema_anterior boolean not null default false;

create or replace function public.definir_emitida_em_sistema_anterior(p_licenca_id uuid, p_valor boolean)
returns void language plpgsql security invoker
set search_path = public as $$
declare
  n integer;
begin
  update public.licencas
     set emitida_em_sistema_anterior = coalesce(p_valor, false)
   where id = p_licenca_id;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Licença não encontrada ou sem permissão para alterar.';
  end if;
end;
$$;

revoke execute on function public.definir_emitida_em_sistema_anterior(uuid, boolean) from public, anon;
grant  execute on function public.definir_emitida_em_sistema_anterior(uuid, boolean) to authenticated;
