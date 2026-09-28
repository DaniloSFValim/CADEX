-- =====================================================================
-- CADEX — lista de documentos aberta ao público
--
-- A página "Como se inscrever" mostra os documentos do art. 6º a partir
-- deste catálogo, para não haver duas listas que possam divergir. O
-- catálogo só tem nomes e fundamentos da Resolução: nenhum dado de
-- empresa ou pessoa.
-- =====================================================================

drop policy tipos_documento_servidor on public.tipos_documento;

grant select on public.tipos_documento to anon;
create policy tipos_documento_publico on public.tipos_documento
  for select to anon, authenticated using (true);
