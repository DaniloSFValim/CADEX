-- =====================================================================
-- CADEX — um processo SEI pode originar mais de uma licença
--
-- O índice único do processo entre licenças ativas impedia cadastrar
-- duas licenças (números distintos) do mesmo processo. Agora o processo
-- só é indexado para consulta. O nº da licença continua único entre as
-- licenças fora da lixeira (licencas_numero_ativo).
-- =====================================================================

drop index if exists public.licencas_processo_sei_ativo;

create index if not exists licencas_processo_sei_consulta_idx
  on public.licencas (processo_sei) where excluida_em is null;
