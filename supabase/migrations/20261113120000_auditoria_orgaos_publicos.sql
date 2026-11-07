-- =====================================================================
-- Auditoria dos órgãos públicos.
--
-- Administração > Órgãos inclui, altera e exclui órgãos contratantes, mas a
-- tabela era a única editada pela tela sem o gatilho de auditoria: as
-- mudanças não deixavam registro de quem, quando, antes e depois. Usa a
-- mesma função das outras 14 tabelas auditadas (registrar_auditoria).
--
-- Não altera dados. Para reverter:
--   drop trigger if exists zz_auditoria on public.orgaos_publicos;
-- =====================================================================

drop trigger if exists zz_auditoria on public.orgaos_publicos;
create trigger zz_auditoria
  after insert or update or delete on public.orgaos_publicos
  for each row execute function public.registrar_auditoria();
