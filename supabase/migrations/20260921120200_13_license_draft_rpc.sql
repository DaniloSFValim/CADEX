-- =====================================================================
-- CADEX — 13: leitura do rascunho de licença com geometria em GeoJSON
--
-- O PostgREST devolve `geometry` como WKB hexadecimal, que o formulário
-- não tem como desenhar de volta no mapa. Esta função devolve o pedido
-- inteiro — licença, intervenção, geometria e documentos anexados — já
-- em GeoJSON, numa chamada só.
--
-- POR QUE SECURITY DEFINER, E COMO A AUTORIZAÇÃO É PRESERVADA
-- A primeira versão era SECURITY INVOKER, para que a RLS decidisse. Só
-- que ela chama `st_asgeojson`, que vive no schema `extensions` — fora do
-- `public` de propósito, desde a migration 00, para não virar endpoint
-- RPC. Como SECURITY INVOKER, a função depende de o papel do chamador ter
-- USAGE naquele schema, coisa que não está declarada em lugar nenhum
-- deste repositório e que eu não tenho como afirmar sobre o projeto real.
-- Um teste rodando como papel de aplicação mostrou o erro: a função
-- simplesmente não enxergava `st_asgeojson`.
--
-- A saída não é alargar o GRANT sobre `extensions`: é o padrão que o
-- resto do sistema já usa — SECURITY DEFINER com a autorização escrita
-- no corpo. `cadex.can_see_intervention` é a MESMA função que as policies
-- de RLS usam, de modo que a regra de visibilidade continua sendo uma só,
-- num lugar só. `supabase/tests/06_autoridade_decisoria.sql` prova que
-- uma empresa não lê o rascunho de outra por aqui.
-- =====================================================================

set search_path = public, extensions;

create or replace function public.license_draft_rpc(p_license_id uuid)
returns jsonb language sql stable security definer
set search_path = public, cadex, extensions as $$
  select jsonb_build_object(
    'license',      to_jsonb(l) - 'pdf_path',
    'intervention', to_jsonb(i) - 'geom' - 'segment_start' - 'segment_end',
    'geometry',      st_asgeojson(i.geom)::jsonb,
    'segment_start', st_asgeojson(i.segment_start)::jsonb,
    'segment_end',   st_asgeojson(i.segment_end)::jsonb,
    'documents', coalesce(
      (select jsonb_agg(to_jsonb(d) order by d.created_at)
         from license_documents d where d.license_id = l.id),
      '[]'::jsonb)
  )
    from licenses l
    join interventions i on i.id = l.intervention_id
   where l.id = p_license_id
     and cadex.can_see_intervention(i.id);
$$;

comment on function public.license_draft_rpc(uuid) is
  'Pedido de licença com geometria em GeoJSON, para edição do rascunho. '
  'Visibilidade decidida por cadex.can_see_intervention — a mesma das policies de RLS.';

revoke execute on function public.license_draft_rpc(uuid) from public;
revoke execute on function public.license_draft_rpc(uuid) from anon;
grant  execute on function public.license_draft_rpc(uuid) to authenticated;
