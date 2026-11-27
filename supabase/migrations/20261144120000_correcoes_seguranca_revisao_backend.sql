-- =====================================================================
-- Correções da revisão de segurança do backend (já aplicadas em cadex-niteroi):
--  1. fotos_https_ok() com search_path fixo.
--  2. intervencoes_publicas: obras públicas canceladas não aparecem na consulta.
-- is_servidor() foi revertida: continua sem exigir MFA (ver teste 03_administracao_contas).
-- =====================================================================

alter function public.fotos_https_ok(text[]) set search_path = pg_catalog;

create or replace view public.intervencoes_publicas with (security_barrier = true) as
select
  i.id,
  case when i.publica or i.executora_modo = 'propria_orgao' then 'publica' else 'sem_licenca' end as categoria,
  i.situacao,
  i.setor,
  i.tipo_intervencao,
  i.escopo,
  i.tipos_obra,
  i.logradouro,
  i.bairro,
  i.referencia,
  coalesce(nullif(btrim(e.nome_fantasia), ''), e.razao_social, nullif(btrim(i.executora_razao_social), '')) as executora,
  i.inicio_lat, i.inicio_lng, i.fim_lat, i.fim_lng,
  i.inicio_previsto,
  i.fim_previsto,
  i.processo_sei,
  i.processo_administrativo,
  i.contrato_numero,
  i.ordem_servico_numero,
  i.foto_url,
  lic.codigo_publico as licenca_codigo,
  i.segmentos,
  o.nome as contratante,
  i.fotos_imagens,
  i.executoras_adicionais,
  i.links_publicos
from public.intervencoes_sem_licenca i
left join public.empresas e on e.id = i.executora_id
left join public.orgaos_publicos o on o.id = i.contratante_orgao_id
left join public.licencas lic on lic.id = i.licenca_id
  and lic.situacao in ('deferida', 'cancelada') and lic.excluida_em is null
where ((i.publica or i.executora_modo = 'propria_orgao') and i.situacao <> 'cancelada')
  or (
    i.situacao = 'em_execucao'
    and (i.executora_modo = 'sem_cadastro' or (e.id is not null and not e.teste))
    and coalesce(i.fim_previsto, i.inicio_previsto) >= public.hoje_niteroi() - 7
    and i.inicio_previsto <= public.hoje_niteroi() + 15
  );
