-- =====================================================================
-- Suspensão: sempre determinada pela fiscalização. A origem diz de quem
-- partiu o pedido: a empresa ("pedido_da_empresa") ou a própria
-- fiscalização ("ato_proprio"). Prorrogação é sempre a pedido da empresa.
-- =====================================================================

alter table public.licenca_suspensoes
  add column if not exists origem text not null default 'pedido_da_empresa'
  check (origem in ('pedido_da_empresa', 'ato_proprio'));

drop function if exists public.suspender_licenca(uuid, date, text);

create or replace function public.suspender_licenca(p_id uuid, p_inicio date, p_motivo text, p_origem text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_licenca record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not (public.is_gestor() or public.is_licenciador()) then
    raise exception 'Sem permissão para suspender licenças.';
  end if;
  if p_origem not in ('pedido_da_empresa', 'ato_proprio') then
    raise exception 'Origem da suspensão inválida.';
  end if;
  select orgao_contratante_id, situacao, concluida_em, inicio_previsto into v_licenca
    from public.licencas where id = p_id and excluida_em is null;
  if not found then raise exception 'Licença não encontrada.'; end if;
  if v_licenca.orgao_contratante_id is not null then
    raise exception 'Licença de órgão público é registro, sem prazo: não se suspende.';
  end if;
  if v_licenca.situacao <> 'deferida' or v_licenca.concluida_em is not null then
    raise exception 'Só se suspende licença deferida e ainda não concluída.';
  end if;
  if v_licenca.inicio_previsto is null or v_hoje > v_licenca.inicio_previsto + 30 then
    raise exception 'A suspensão só pode ser pedida nos 30 dias a partir do início da obra ou serviço.';
  end if;
  if p_inicio > v_hoje or p_inicio < v_licenca.inicio_previsto then
    raise exception 'O início da suspensão precisa estar entre o início da obra ou serviço e hoje.';
  end if;
  insert into public.licenca_suspensoes (licenca_id, inicio, motivo, origem)
    values (p_id, p_inicio, btrim(p_motivo), p_origem);
end $$;

revoke execute on function public.suspender_licenca(uuid, date, text, text) from public, anon;
grant  execute on function public.suspender_licenca(uuid, date, text, text) to authenticated;
