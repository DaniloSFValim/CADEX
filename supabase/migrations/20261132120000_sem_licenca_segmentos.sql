-- =====================================================================
-- CADEX — obra ou serviço sem licença com vários segmentos (ex.: os dois
-- lados da rua), como já acontece nos trechos de licença.
-- Coluna "segmentos": MultiLineString em 4326, dentro da faixa de Niterói.
-- Início e fim continuam preenchidos com o primeiro segmento, para as telas
-- e consultas antigas. O mapa público desenha a MultiLineString inteira
-- quando ela existe.
--
-- A view expõe a coluna em EWKB hexadecimal (o PostgREST devolve geometria
-- assim); o cliente lê com lerSegmentosWkb. Sem função PostGIS na view, então
-- não depende do search_path do papel que consulta.
--
-- Reversão: recriar a view sem a coluna "segmentos" (versão de 20261131120000)
-- e remover a coluna e o índice.
-- =====================================================================

alter table public.intervencoes_sem_licenca
  add column if not exists segmentos geometry(MultiLineString, 4326),
  add constraint intervencoes_sem_licenca_segmentos_niteroi check (
    segmentos is null or (
      ST_IsValid(segmentos)
      and ST_XMin(segmentos) >= -43.25 and ST_XMax(segmentos) <= -42.85
      and ST_YMin(segmentos) >= -23.10 and ST_YMax(segmentos) <= -22.75));

create index if not exists intervencoes_sem_licenca_segmentos_idx on public.intervencoes_sem_licenca using gist (segmentos);

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
  i.segmentos
from public.intervencoes_sem_licenca i
left join public.empresas e on e.id = i.executora_id
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
