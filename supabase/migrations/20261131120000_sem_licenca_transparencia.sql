-- =====================================================================
-- CADEX — transparência nas obras e serviços sem licença: o cartão do mapa
-- público mostra processo, processo administrativo, contrato, ordem de
-- serviço, link da licença (quando regularizada) e um link para as fotos
-- hospedadas fora do CADEX (prévia no cartão).
--
-- Só https: o campo guarda apenas o endereço; as imagens ficam no
-- serviço de hospedagem escolhido pela SECONSER/CADEX.
--
-- Reversão: recriar a view sem as colunas novas (versão de 20261128120000)
-- e remover a coluna foto_url.
-- =====================================================================

alter table public.intervencoes_sem_licenca
  add column if not exists foto_url text,
  add constraint intervencoes_sem_licenca_foto_https check (
    foto_url is null or foto_url ~ '^https://[^[:space:]]+$');

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
  lic.codigo_publico as licenca_codigo
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
