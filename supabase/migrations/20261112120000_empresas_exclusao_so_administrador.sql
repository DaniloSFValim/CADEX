-- =====================================================================
-- Exclusão de empresa só pelo administrador, pela função admin_excluir_empresa.
--
-- Antes: a política empresas_excluir deixava o gestor apagar uma empresa
-- direto pela API (DELETE). Isso pulava as regras da função (não apaga
-- empresa habilitada e ativa, nem empresa com licença) e levava junto, em
-- cascata, documentos, vínculos, histórico de situação, responsáveis
-- técnicos, funcionários e veículos. A tela nunca usou esse caminho: toda
-- exclusão de empresa já passava por admin_excluir_empresa.
--
-- A função é SECURITY DEFINER e pertence ao dono da tabela; sem RLS forçado,
-- ela continua apagando normalmente depois desta mudança.
--
-- Não altera nenhum dado. Para reverter:
--   create policy empresas_excluir on public.empresas
--     for delete to authenticated using (public.is_gestor());
--   grant delete on public.empresas to authenticated;
-- =====================================================================

drop policy if exists empresas_excluir on public.empresas;
revoke delete, truncate on public.empresas from anon, authenticated;
