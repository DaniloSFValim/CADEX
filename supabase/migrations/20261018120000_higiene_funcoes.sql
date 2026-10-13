-- =====================================================================
-- CADEX — higiene de funções (achados do verificador de segurança do Supabase)
--
-- 1. licencas_exige_autoexecucao_habilitada() é função de gatilho e não deve
--    ser chamável por ninguém: tira o EXECUTE de public, anon e authenticated
--    (como as demais funções de gatilho). O gatilho continua funcionando; o
--    EXECUTE só é checado ao criar o gatilho.
-- 2. empresas_situacao() e vinculos_antes_de_gravar() passam a ter o
--    search_path fixo em "public". As duas só usam objetos com "public."
--    explícito e funções do sistema, então o comportamento não muda.
-- 3. zzz_probe_rowtype() é uma sonda de teste esquecida em produção (devolve
--    o id de uma linha vazia). Nada a usa. Sai.
--
-- Reversão: recriar os GRANTs e a função de teste, se alguém quiser; nenhum
-- dado é tocado.
-- =====================================================================

revoke execute on function public.licencas_exige_autoexecucao_habilitada() from public, anon, authenticated;

alter function public.empresas_situacao() set search_path = public;
alter function public.vinculos_antes_de_gravar() set search_path = public;

drop function if exists public.zzz_probe_rowtype();
