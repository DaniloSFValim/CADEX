-- =====================================================================
-- Validação estrita dos links públicos de obras sem licença.
-- Cada item precisa ser objeto, ter o campo url como texto e começar com
-- https://. Itens sem url, com url não textual ou não-objeto são recusados.
-- Já aplicada no projeto cadex-niteroi (validada, sem violações nos dados).
-- =====================================================================

alter table public.intervencoes_sem_licenca drop constraint if exists intervencoes_links_publicos_https;
alter table public.intervencoes_sem_licenca add constraint intervencoes_links_publicos_https check (not jsonb_path_exists(links_publicos, '$[*] ? (@.type() != "object" || !exists(@.url) || @.url.type() != "string" || !(@.url starts with "https://"))'));
