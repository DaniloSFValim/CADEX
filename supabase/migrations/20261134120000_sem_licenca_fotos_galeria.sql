-- =====================================================================
-- CADEX — galeria de fotos nas obras e serviços sem licença.
-- "fotos_imagens": lista de links https diretos das imagens (até 12), que o
-- cartão público mostra como galeria. O campo "foto_url" passa a ser o link da
-- pasta com todas as fotos ("Mais fotos" no cartão).
--
-- Reversão: recriar a view sem "fotos_imagens" (versão de 20261133120000) e
-- remover a coluna e a função.
-- =====================================================================

alter table public.intervencoes_sem_licenca
  add column if not exists fotos_imagens text[];

-- Todos os links da lista têm que ser https (sem espaço). Função, porque o CHECK não aceita subconsulta.
create or replace function public.fotos_https_ok(p text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(x ~ '^https://[^[:space:]]+$'), true) from unnest(p) as x
$$;

alter table public.intervencoes_sem_licenca
  drop constraint if exists intervencoes_sem_licenca_fotos_imagens_check,
  add constraint intervencoes_sem_licenca_fotos_imagens_check check (
    fotos_imagens is null or (cardinality(fotos_imagens) <= 12 and public.fotos_https_ok(fotos_imagens)));

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
  o.nome as contratante,
  i.fotos_imagens
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
