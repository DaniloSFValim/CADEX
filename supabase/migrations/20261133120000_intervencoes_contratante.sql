-- =====================================================================
-- CADEX — o cartão público das obras e serviços sem licença mostra o órgão
-- contratante. A view ganha a coluna "contratante" (nome do órgão), no fim.
--
-- Reversão: recriar a view sem a coluna "contratante" (versão de 20261132120000).
-- =====================================================================

-- Colunas novas entram no fim da view (exigência do CREATE OR REPLACE VIEW).
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
  o.nome as contratante
from public.intervencoes_sem_licenca i
left join public.empresas e on e.id = i.executora_id
left join public.orgaos_publicos o on o.id = i.contratante_orgao_id
left join public.licencas lic on lic.id = i.licenca_id
  and lic.situacao in ('deferida', 'cancelada') and lic.excluida_em is null
where i.publica or i.executora_modo = 'propria_orgao'
  or (
    i.situacao = 'em_execucao'
    and (i.executora_modo = 'sem_cadastro' or (e.id is not null and not e.teste))
    and coalesce(i.fim_previsto, i.inicio_previsto) >= public.hoje_niteroi() - 7
    and i.inicio_previsto <= public.hoje_niteroi() + 15
  );

grant select on public.intervencoes_publicas to anon, authenticated;
