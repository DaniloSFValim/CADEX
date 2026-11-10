-- =====================================================================
-- CADEX — números da consulta pública, versão 2
--
-- Pedido da SECONSER: "autorizadas" (e não "deferidas") nos últimos 12
-- meses, obras concluídas nos últimos cinco anos, e empresas executoras.
-- Sai "em andamento ou a começar".
--
--   autorizadas_12m   licenças deferidas (autorizadas) protocoladas nos
--                     últimos 12 meses; o CADEX não guarda a data de
--                     emissão, usa-se a do protocolo
--   concluidas_5a     obras deferidas com conclusão nos últimos cinco anos,
--                     até hoje (conclusões com data futura não contam)
--   executoras        empresas executoras com pelo menos uma obra no mapa
--   empresas_ativas   empresas cadastradas e ativas no CADEX
--
-- Reversão: recriar a função anterior (versão de 20261122120000).
-- =====================================================================
create or replace function public.estatisticas_publicas()
returns jsonb language sql stable security definer
set search_path = public, extensions as $$
  with obras as (
    select o from jsonb_array_elements(public.obras_publicas()) as o
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'autorizadas_12m', (select count(*) from public.licencas l, hoje
                         where l.situacao = 'deferida' and l.excluida_em is null
                           and l.protocolo_data >= hoje.d - 365 and l.protocolo_data <= hoje.d),
    'concluidas_5a', (select count(*) from public.licencas l, hoje
                       where l.situacao = 'deferida' and l.excluida_em is null
                         and l.concluida_em >= hoje.d - interval '5 years' and l.concluida_em <= hoje.d),
    'executoras', (select count(distinct o->>'executora') from obras where coalesce(o->>'executora', '') <> ''),
    'empresas_ativas', (select count(*) from public.empresas where ativa)
  );
$$;

revoke execute on function public.estatisticas_publicas() from public;
grant execute on function public.estatisticas_publicas() to anon, authenticated;
