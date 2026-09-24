-- =====================================================================
-- CADEX — 15: o mapa público voltou a abrir para o visitante sem login
--
-- A migration 14 revogou EXECUTE de `cadex.is_company_active` também do
-- papel `anon`. Só que a view `public_interventions` (migration 08) chama
-- a função para publicar a situação cadastral da executora, e o Postgres
-- confere o EXECUTE de funções chamadas por uma view como o usuário que
-- consulta, não como o dono da view. Resultado: a página pública passou a
-- responder "permission denied for function is_company_active".
--
-- Devolver o EXECUTE ao `anon` não expõe nada: a função responde apenas
-- se uma empresa tem CADEX ativo, fato que o art. 7º, § 2º manda publicar
-- e que `public_companies` já publica.
-- =====================================================================

grant execute on function cadex.is_company_active(uuid) to anon;
