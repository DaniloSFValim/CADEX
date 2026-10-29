-- =====================================================================
-- Suspensão e prorrogação só podem ser pedidas nos 30 dias a partir do
-- início da obra ou serviço (regra da SECONSER). Fora desse prazo, a
-- administração não suspende nem prorroga; retomar uma suspensão já
-- aberta continua permitido.
-- =====================================================================

create or replace function public.prorrogar_licenca(p_id uuid, p_validade date)
returns void language plpgsql security invoker
set search_path = public as $$
declare
  v_orgao uuid;
  v_atual date;
  v_inicio date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not (public.is_gestor() or public.is_licenciador()) then
    raise exception 'Sem permissão para prorrogar licenças.';
  end if;
  select orgao_contratante_id, validade_ate, inicio_previsto into v_orgao, v_atual, v_inicio
    from public.licencas where id = p_id;
  if not found then
    raise exception 'Licença não encontrada.';
  end if;
  if v_orgao is not null then
    raise exception 'Licença de órgão público é registro, sem prazo de validade.';
  end if;
  if v_inicio is null or v_hoje > v_inicio + 30 then
    raise exception 'A prorrogação só pode ser pedida nos 30 dias a partir do início da obra ou serviço.';
  end if;
  if p_validade is null or (v_atual is not null and p_validade <= v_atual) then
    raise exception 'A nova validade precisa ser posterior à validade atual.';
  end if;
  update public.licencas
     set validade_ate = p_validade, prorrogacoes = prorrogacoes + 1
   where id = p_id;
end;
$$;

create or replace function public.suspender_licenca(p_id uuid, p_inicio date, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_licenca record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not (public.is_gestor() or public.is_licenciador()) then
    raise exception 'Sem permissão para suspender licenças.';
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
  insert into public.licenca_suspensoes (licenca_id, inicio, motivo) values (p_id, p_inicio, btrim(p_motivo));
end $$;
