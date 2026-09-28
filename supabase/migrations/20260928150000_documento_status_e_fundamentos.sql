-- =====================================================================
-- Add status column for documents without validade
-- Remove legal citations from fundamentos
-- =====================================================================

-- Add status column to documentos (para documentos sem validade)
alter table public.documentos
add column status text default 'pendente' check (status in ('pendente', 'entregue'));

-- Update fundamentos to remove legal citations
update public.tipos_documento set fundamento = 'Documento de identificação da empresa' where codigo = 'CNPJ_CARD';
update public.tipos_documento set fundamento = 'Ato constitutivo da empresa' where codigo = 'CONTRATO_SOCIAL';
update public.tipos_documento set fundamento = 'Identificação dos responsáveis' where codigo = 'DOC_SOCIOS';
update public.tipos_documento set fundamento = 'Comprovação de regularidade fiscal federal' where codigo = 'CND_FEDERAL';
update public.tipos_documento set fundamento = 'Comprovação de regularidade fiscal estadual' where codigo = 'CND_ESTADUAL';
update public.tipos_documento set fundamento = 'Comprovação de regularidade fiscal municipal' where codigo = 'CND_MUNICIPAL';
update public.tipos_documento set fundamento = 'Comprovação de regularidade com FGTS e CRF' where codigo = 'CRF_FGTS';
update public.tipos_documento set fundamento = 'Comprovação de regularidade trabalhista' where codigo = 'CNDT';
update public.tipos_documento set fundamento = 'Registro profissional do responsável técnico' where codigo = 'REG_RT';
update public.tipos_documento set fundamento = 'Comprovação de capacidade técnica' where codigo = 'ART_RRT_CARGO';
update public.tipos_documento set fundamento = 'Recursos técnicos e humanos' where codigo = 'REL_EQUIPAMENTOS';
update public.tipos_documento set fundamento = 'Conformidade regulatória' where codigo = 'DECL_REGULADOR';
update public.tipos_documento set fundamento = 'Localização de infraestrutura' where codigo = 'MAPA_INFRA';
update public.tipos_documento set fundamento = 'Compartilhamento de infraestrutura' where codigo = 'CONTRATO_COMPART';
update public.tipos_documento set fundamento = 'Regularidade de instalações' where codigo = 'COMPROV_ADIMPLENCIA';
