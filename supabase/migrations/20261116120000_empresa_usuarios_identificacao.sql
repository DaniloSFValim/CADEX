-- =====================================================================
-- CADEX — identificação do representante de empresa
--
-- O gestor precisa ver quem é cada acesso de empresa (nome e e-mail).
-- A tabela está vazia em produção (nenhum vínculo cadastrado), então as
-- colunas podem ser obrigatórias já na criação.
--
-- Reversão: remover as duas colunas. Nenhuma outra tabela depende delas.
-- =====================================================================

alter table public.empresa_usuarios
  add column nome  text not null check (btrim(nome) <> ''),
  add column email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');
