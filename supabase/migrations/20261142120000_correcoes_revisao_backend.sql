-- =====================================================================
-- Correções da revisão de código do backend (code-review):
--  1. Links públicos de obras sem licença: só https, também no banco.
--     NOT VALID: confere as linhas novas e as alteradas; as antigas
--     podem ser validadas depois com VALIDATE CONSTRAINT.
--  2. Situação pública: licença sem data de início não aparece como
--     "em execução". Sem início previsto, a licença segue como programada.
-- =====================================================================

alter table public.intervencoes_sem_licenca
  add constraint intervencoes_links_publicos_https
  check (not jsonb_path_exists(links_publicos, '$[*] ? (!(@.url starts with "https://"))'))
  not valid;

create or replace function public.situacao_publica(l public.licencas, p_hoje date, p_suspensa boolean)
returns text language sql stable
set search_path = public as $$
  select case
    when l.situacao = 'cancelada' then 'cancelada'
    when p_suspensa then 'suspensa'
    when l.inicio_previsto is null then 'aguardando_inicio'
    when p_hoje < l.inicio_previsto then 'aguardando_inicio'
    when l.fim_previsto is not null and p_hoje > l.fim_previsto then 'encerrada'
    else 'vigente'
  end;
$$;
