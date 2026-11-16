-- =====================================================================
-- Situação pública sem "prazo encerrado". Ficam só três situações:
-- programada (aguardando início), em execução e concluída.
-- Uma licença cujo prazo venceu sem conclusão registrada continua "em execução"
-- no público até alguém confirmar a situação real. No painel interno ela segue
-- aparecendo como alerta de revisão.
-- =====================================================================

create or replace function public.situacao_publica(l public.licencas, p_hoje date, p_suspensa boolean)
returns text language sql stable
set search_path = public as $$
  select case
    when l.situacao = 'cancelada' then 'cancelada'
    when l.concluida_em is not null and (l.fim_previsto is null or p_hoje > l.fim_previsto) then 'concluida'
    when p_suspensa then 'suspensa'
    when p_hoje < l.inicio_previsto then 'aguardando_inicio'
    else 'vigente'
  end;
$$;
