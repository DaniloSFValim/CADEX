-- =====================================================================
-- CADEX — números da consulta pública (só contagens, sem dado pessoal)
--
-- Os indicadores da consulta pública eram "vigentes", "bairros" e
-- "executoras". Com a maioria das obras já concluídas, "vigentes agora"
-- dava zero e não informava nada. Esta função devolve contagens úteis ao
-- cidadão, calculadas sobre as mesmas obras do mapa (obras_publicas):
--
--   protocoladas_12m  licenças deferidas protocoladas nos últimos 12 meses
--                     (o CADEX não guarda a data de emissão; usa-se a do
--                     protocolo)
--   concluidas        obras com conclusão registrada
--   em_andamento      obras vigentes ou aguardando início
--   executoras        empresas executoras com pelo menos uma obra no mapa
--   empresas_ativas   empresas cadastradas e ativas no CADEX
--
-- Reversão: drop function public.estatisticas_publicas().
-- =====================================================================
create or replace function public.estatisticas_publicas()
returns jsonb language sql stable security definer
set search_path = public, extensions as $$
  with obras as (
    select o from jsonb_array_elements(public.obras_publicas()) as o
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'protocoladas_12m', (select count(*) from public.licencas l, hoje
                          where l.situacao = 'deferida' and l.excluida_em is null
                            and l.protocolo_data >= hoje.d - 365),
    'concluidas', (select count(*) from obras where o->>'situacao' = 'concluida'),
    'em_andamento', (select count(*) from obras where o->>'situacao' in ('vigente', 'aguardando_inicio')),
    'executoras', (select count(distinct o->>'executora') from obras where coalesce(o->>'executora', '') <> ''),
    'empresas_ativas', (select count(*) from public.empresas where ativa)
  );
$$;

revoke execute on function public.estatisticas_publicas() from public;
grant execute on function public.estatisticas_publicas() to anon, authenticated;
