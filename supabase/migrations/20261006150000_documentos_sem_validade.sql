-- =====================================================================
-- CADEX — documentos sem data de validade
--
-- Decisão da SECONSER: o controle de prazo do cadastro é a validade da
-- inscrição (12 meses, art. 7º, § 1º), revista na renovação, quando os
-- documentos são reapresentados. Acompanhar o vencimento de cada certidão
-- em separado (certidões negativas vencem a cada 30–90 dias) só gerava
-- ruído, sem ponto de controle real.
--
-- O documento passa a ser apenas Pendente/Entregue. O campo "válido até"
-- some da tela sozinho (é condicionado a tem_validade) e o documento
-- entregue conta como em dia. Nada é apagado: as datas já gravadas ficam
-- no histórico, apenas deixam de ser exigidas e exibidas.
-- =====================================================================

alter table public.tipos_documento alter column tem_validade set default false;
update public.tipos_documento set tem_validade = false where tem_validade;
