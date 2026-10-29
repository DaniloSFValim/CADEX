-- =====================================================================
-- Prazo de 30 dias para todas as licenças, de obra pública ou não. O prazo é
-- calculado automaticamente a partir do início da obra ou serviço. Não há mais
-- "registro sem prazo" para órgão público.
-- =====================================================================

-- 1. Validade automática: início + 30, para qualquer licença deferida.
create or replace function public.licencas_validade()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.situacao = 'deferida' and new.inicio_previsto is not null then
    -- Sem validade, ou ainda no prazo automático: acompanha o início.
    -- Prorrogação gravada à mão fica intacta.
    if new.validade_ate is null
       or (tg_op = 'UPDATE' and old.validade_ate = old.inicio_previsto + 30
           and new.inicio_previsto is distinct from old.inicio_previsto) then
      new.validade_ate := new.inicio_previsto + 30;
      new.prorrogacoes := 0;
    end if;
  end if;
  return new;
end;
$$;

-- 2. Licenças já deferidas que ficaram sem validade (órgão público) ganham o prazo.
update public.licencas
   set validade_ate = inicio_previsto + 30
 where situacao = 'deferida' and inicio_previsto is not null and validade_ate is null;

-- 3. Prorrogação: qualquer licença, dentro dos 30 dias a partir do início.
create or replace function public.prorrogar_licenca(p_id uuid, p_validade date)
returns void language plpgsql security invoker
set search_path = public as $$
declare
  v_atual date;
  v_inicio date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not (public.is_gestor() or public.is_licenciador()) then
    raise exception 'Sem permissão para prorrogar licenças.';
  end if;
  select validade_ate, inicio_previsto into v_atual, v_inicio
    from public.licencas where id = p_id;
  if not found then
    raise exception 'Licença não encontrada.';
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

-- 4. Situação pública: sem o ramo "registro".
create or replace function public.situacao_publica(l public.licencas, p_hoje date, p_suspensa boolean)
returns text language sql stable
set search_path = public as $$
  select case
    when l.situacao = 'cancelada' then 'cancelada'
    when l.concluida_em is not null and (l.fim_previsto is null or p_hoje > l.fim_previsto) then 'concluida'
    when p_suspensa then 'suspensa'
    when l.validade_ate is not null and p_hoje > l.validade_ate then 'prazo_encerrado'
    when p_hoje < l.inicio_previsto then 'aguardando_inicio'
    else 'vigente'
  end;
$$;

-- 5. Suspensão: qualquer licença deferida e não concluída, dentro dos 30 dias.
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
  select situacao, concluida_em, inicio_previsto into v_licenca
    from public.licencas where id = p_id and excluida_em is null;
  if not found then raise exception 'Licença não encontrada.'; end if;
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
