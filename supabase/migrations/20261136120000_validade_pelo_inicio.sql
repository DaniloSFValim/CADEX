-- =====================================================================
-- CADEX — validade da licença sempre a partir do início da obra ou serviço.
--
-- Problema: parte das licenças ficou com validade calculada a partir do
-- protocolo (protocolo + 30) e uma (130/2025) com protocolo + 365. Com isso, a
-- licença cuja obra ainda não começou aparecia como "prazo encerrado", e o
-- cartão mostrava uma validade anterior ao início.
--
-- Regra: deferida, sem prorrogação => validade = início + 30 (o trigger
-- recalcula a cada gravação). Prorrogação (prorrogacoes > 0) fica intacta.
-- Situação: "aguardando início" vem antes de "prazo encerrado".
--
-- Reversão: recriar a função de 20261107120000 e a situacao_publica de
-- 20261106120000; a correção de dados não se desfaz automaticamente.
-- =====================================================================

create or replace function public.licencas_validade()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.situacao = 'deferida' and new.inicio_previsto is not null and coalesce(new.prorrogacoes, 0) = 0 then
    new.validade_ate := new.inicio_previsto + 30;
  end if;
  return new;
end;
$$;

-- Corrige o que já está gravado: validade calculada pelo protocolo (protocolo + 30), sem prorrogação.
-- A 130/2025 (protocolo + 365) fica de fora: depende de decisão.
update public.licencas
   set validade_ate = inicio_previsto + 30
 where situacao = 'deferida' and inicio_previsto is not null and coalesce(prorrogacoes, 0) = 0
   and validade_ate = protocolo_data + 30
   and validade_ate is distinct from inicio_previsto + 30;

create or replace function public.situacao_publica(l public.licencas, p_hoje date, p_suspensa boolean)
returns text language sql stable
set search_path = public as $$
  select case
    when l.situacao = 'cancelada' then 'cancelada'
    when l.concluida_em is not null and (l.fim_previsto is null or p_hoje > l.fim_previsto) then 'concluida'
    when p_suspensa then 'suspensa'
    when p_hoje < l.inicio_previsto then 'aguardando_inicio'
    when l.validade_ate is not null and p_hoje > l.validade_ate then 'prazo_encerrado'
    else 'vigente'
  end;
$$;
