-- =====================================================================
-- Situação pública pelas datas do cronograma, como consultado no dia:
--   programada     (aguardando_inicio): ainda não começou, mas já está cadastrada;
--   em execução    (vigente): entre o início e o fim previstos;
--   encerrada      (encerrada): passou do fim previsto.
-- A data de conclusão não muda a situação pública: a obra concluída antes do fim segue a data.
-- O prazo de 30 dias continua na validade da licença; não define mais a situação pública.
-- =====================================================================

create or replace function public.situacao_publica(l public.licencas, p_hoje date, p_suspensa boolean)
returns text language sql stable
set search_path = public as $$
  select case
    when l.situacao = 'cancelada' then 'cancelada'
    when p_suspensa then 'suspensa'
    when p_hoje < l.inicio_previsto then 'aguardando_inicio'
    when l.fim_previsto is not null and p_hoje > l.fim_previsto then 'encerrada'
    else 'vigente'
  end;
$$;
