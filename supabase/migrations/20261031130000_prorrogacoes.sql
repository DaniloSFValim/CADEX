-- =====================================================================
-- Prorrogação de validade com contagem (1ª, 2ª, 3ª...).
--
-- Cada prorrogação pedida pela administração soma 1 em licencas.prorrogacoes.
-- Licença de órgão público continua sem prazo: não se prorroga.
-- Quando o prazo automático é recalculado (sem prorrogação), a contagem volta a zero.
-- =====================================================================

alter table public.licencas add column if not exists prorrogacoes integer not null default 0;

alter table public.licencas drop constraint if exists licencas_prorrogacoes_check;
alter table public.licencas add constraint licencas_prorrogacoes_check check (prorrogacoes >= 0);

-- Regra de validade (corpo da 20261031120000) com a contagem zerada junto com o recálculo automático.
-- Prorrogação gravada à mão é preservada: só o prazo automático (início + 30) é recalculado.
create or replace function public.licencas_validade()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.orgao_contratante_id is not null then
    new.validade_ate := null;
    new.prorrogacoes := 0;
  elsif new.situacao = 'deferida' and new.inicio_previsto is not null then
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

-- Prorrogar: quem grava licenças (gestor ou licenciador), validade posterior à atual.
create or replace function public.prorrogar_licenca(p_id uuid, p_validade date)
returns void language plpgsql security invoker
set search_path = public as $$
declare
  v_orgao uuid;
  v_atual date;
begin
  if not (public.is_gestor() or public.is_licenciador()) then
    raise exception 'Sem permissão para prorrogar licenças.';
  end if;
  select orgao_contratante_id, validade_ate into v_orgao, v_atual from public.licencas where id = p_id;
  if not found then
    raise exception 'Licença não encontrada.';
  end if;
  if v_orgao is not null then
    raise exception 'Licença de órgão público é registro, sem prazo de validade.';
  end if;
  if p_validade is null or (v_atual is not null and p_validade <= v_atual) then
    raise exception 'A nova validade precisa ser posterior à validade atual.';
  end if;
  update public.licencas
     set validade_ate = p_validade, prorrogacoes = prorrogacoes + 1
   where id = p_id;
end;
$$;

revoke execute on function public.prorrogar_licenca(uuid, date) from public, anon;
grant  execute on function public.prorrogar_licenca(uuid, date) to authenticated;
