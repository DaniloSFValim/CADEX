-- =====================================================================
-- Números da consulta pública: só contagens, sem dado pessoal, e
-- consistentes com o mapa (não podem passar do total de obras).
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

do $$
declare
  r jsonb;
begin
  r := public.estatisticas_publicas();
  perform pg_temp.assert(r ? 'autorizadas_12m' and r ? 'concluidas_5a'
                         and r ? 'executoras' and r ? 'empresas_ativas',
    'estatisticas_publicas deveria devolver as quatro contagens');
  perform pg_temp.assert((r->>'executoras')::int <= jsonb_array_length(public.obras_publicas()),
    'executoras não podem passar do total de obras do mapa');
  perform pg_temp.assert((r->>'concluidas_5a')::int >= 0 and (r->>'autorizadas_12m')::int >= 0,
    'contagens não podem ser negativas');
  perform pg_temp.assert(has_function_privilege('anon', 'public.estatisticas_publicas()', 'execute'),
    'visitante deveria poder ler as estatísticas');
end $$;

rollback;
