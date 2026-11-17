-- =====================================================================
-- Obra sem licença com mais de uma empresa: a concessionária e as terceirizadas
-- que atuam junto com a executora principal. Lista de até 10 registros, no formato:
-- {papel: 'concessionaria' | 'terceirizada', modo: 'empresa' | 'sem_cadastro',
--  executora_id (quando cadastrada), nome, cnpj (opcional)}.
-- A view pública devolve a lista no fim (colunas antigas não mudam).
-- =====================================================================

alter table public.intervencoes_sem_licenca
  add column if not exists executoras_adicionais jsonb not null default '[]'::jsonb,
  add constraint intervencoes_executoras_adicionais_lista
    check (jsonb_typeof(executoras_adicionais) = 'array' and jsonb_array_length(executoras_adicionais) <= 10);

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
  i.executoras_adicionais
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
