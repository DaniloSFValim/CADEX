-- =====================================================================
-- Retira da consulta pública o histórico da situação da licença.
--
-- Pedido registrado, deferimento e datas de mudança são dados internos da
-- administração. A página pública da licença deixou de chamar esta função;
-- aqui ela sai do banco, para que a API não a exponha a anônimos.
-- =====================================================================

drop function if exists public.licenca_publica_historico(text);
