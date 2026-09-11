-- =====================================================================
-- CADEX — 10: retirada dos GRANTs que o Supabase concede ao `anon`
--
-- ACHADO DO DEPLOY REAL: o Supabase configura, no projeto novo,
--   alter default privileges in schema public grant all on tables
--     to anon, authenticated;
-- de modo que TODA tabela criada pelas migrations nasce com SELECT
-- (e mais) para o papel `anon`.
--
-- Nenhuma linha vazava: a RLS está habilitada e forçada, e nenhuma
-- policy contempla o `anon`. Mas a arquitetura documentada afirmava que
-- "o anon não tem grant em tabela alguma", e isso era verdade apenas no
-- Postgres local do teste — onde não existe esse default privilege.
--
-- A afirmação passa a ser verdadeira também em produção. Vale como
-- defesa em profundidade: o `anon` perde o acesso na camada de GRANT,
-- antes mesmo de a RLS ser avaliada, e um erro futuro de policy deixa
-- de ser suficiente para expor dado.
-- =====================================================================
set search_path = public, extensions;

do $do$
declare t text;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $do$;

revoke all on all sequences in schema public from anon;

-- Tabelas e funções criadas daqui em diante também nascem sem acesso ao
-- `anon`. Este default privilege, definido pelo papel `postgres`, é a
-- origem exata da falha corrigida na migration 09: ele concedia EXECUTE
-- em TODA função nova ao `anon`, e o `grant ... to authenticated` que eu
-- escrevia não excluía nada.
--
-- LIMITAÇÃO CONHECIDA: existe um segundo conjunto de privilégios-padrão
-- definido pelo papel `supabase_admin`, que esta conexão não tem poder
-- para alterar. Ele rege apenas objetos criados POR supabase_admin —
-- isto é, os internos da plataforma, não os deste sistema. Objetos
-- criados pelas migrations nascem sob o default do `postgres`, que é o
-- alterado abaixo. Ver SECURITY.md.
do $do$
begin
  alter default privileges in schema public revoke all on tables    from anon;
  alter default privileges in schema public revoke all on sequences from anon;
  alter default privileges in schema public revoke all on functions from anon;
exception when insufficient_privilege then
  raise notice 'Sem permissao para alterar privilegios-padrao; revisar manualmente.';
end $do$;

-- O que o público alcança é, e continua sendo, exatamente isto:
-- duas views sem dado pessoal e duas funções de verificação.
grant select on public_companies, public_interventions to anon;
grant execute on function public.verify_public_token(text) to anon;
grant execute on function public.interventions_near(double precision, double precision, int) to anon;
