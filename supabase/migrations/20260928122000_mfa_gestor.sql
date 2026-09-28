-- =====================================================================
-- CADEX — verificação em duas etapas obrigatória para o gestor
--
-- O gestor (SECONSER) defere inscrições e altera o cadastro. Esses
-- poderes só valem numa sessão confirmada com o código do aplicativo
-- autenticador (nível `aal2` no token). Com só a senha, o gestor entra
-- mas não lê nem grava nada até digitar o código; o site pede o
-- cadastro do aplicativo no primeiro acesso.
--
-- Como a regra está em is_gestor(), ela vale para todas as tabelas e
-- para os arquivos (documentos e logos) de uma vez.
--
-- Celular perdido: o administrador apaga o fator no SQL Editor e o
-- servidor cadastra de novo no próximo acesso (ver README).
-- =====================================================================

create or replace function public.is_gestor()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid() and papel = 'gestor')
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke execute on function public.is_gestor() from public, anon;
grant  execute on function public.is_gestor() to authenticated;
