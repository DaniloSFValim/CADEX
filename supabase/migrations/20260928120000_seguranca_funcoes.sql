-- =====================================================================
-- CADEX — ajustes apontados pelo verificador de segurança do Supabase
--
-- 1. search_path fixo em todas as funções. Sem isso, quem conseguisse
--    criar um objeto com o mesmo nome num schema anterior do caminho
--    poderia desviar a função.
-- 2. Funções de gatilho fora da API. Elas só rodam como gatilho (o
--    Postgres não confere EXECUTE ao disparar), então ninguém precisa
--    chamá-las por /rest/v1/rpc.
--
-- Continuam executáveis, de propósito:
--   consulta_publica()       consulta aberta ao público (art. 7º, § 2º)
--   is_servidor(), is_gestor() usadas pelas regras de acesso (RLS), que
--                            rodam com o papel de quem consulta; só dizem
--                            algo sobre o próprio usuário
-- =====================================================================

alter function public.cnpj_valido(text)                 set search_path = public;
alter function public.cpf_valido(text)                  set search_path = public;
alter function public.situacao_efetiva(text, date)      set search_path = public;
alter function public.documentos_antes_de_gravar()      set search_path = public;
alter function public.vinculos_antes_de_gravar()        set search_path = public;
alter function public.veiculos_antes_de_gravar()        set search_path = public;
alter function public.empresas_situacao()               set search_path = public;

revoke execute on function public.empresas_antes_de_gravar()     from public, anon, authenticated;
revoke execute on function public.registrar_historico_situacao() from public, anon, authenticated;
revoke execute on function public.documentos_antes_de_gravar()   from public, anon, authenticated;
revoke execute on function public.vinculos_antes_de_gravar()     from public, anon, authenticated;
revoke execute on function public.veiculos_antes_de_gravar()     from public, anon, authenticated;
revoke execute on function public.empresas_situacao()            from public, anon, authenticated;
