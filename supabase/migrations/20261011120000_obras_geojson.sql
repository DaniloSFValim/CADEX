-- =====================================================================
-- CADEX — dados abertos: obras licenciadas em GeoJSON.
--
-- Inspirado no Street Manager (Reino Unido), que publica os street works
-- como dado aberto para qualquer um construir ferramentas (planejamento,
-- trânsito, imprensa). Aqui é uma FeatureCollection com uma Feature por
-- trecho (LineString quando há fim; Point quando é pontual, ex.: poste).
--
-- Espelha EXATAMENTE a seleção e os campos públicos de obras_publicas()
-- (só licenças emitidas/canceladas; nenhum dado interno), para o dado
-- aberto bater com o mapa público. Aberto ao anon.
-- =====================================================================

create or replace function public.obras_geojson()
returns jsonb language sql stable security definer
set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(f.feature order by f.fim_previsto desc nulls last, f.ordem), '[]'::jsonb)
  )
  from (
    select l.fim_previsto, t.ordem,
      jsonb_build_object(
        'type', 'Feature',
        'geometry', case
          when t.fim_lat is null or t.fim_lng is null
            then jsonb_build_object('type', 'Point',
                   'coordinates', jsonb_build_array(t.inicio_lng, t.inicio_lat))
          else jsonb_build_object('type', 'LineString',
                 'coordinates', jsonb_build_array(
                   jsonb_build_array(t.inicio_lng, t.inicio_lat),
                   jsonb_build_array(t.fim_lng, t.fim_lat))) end,
        'properties', jsonb_build_object(
          'codigo', l.codigo_publico,
          'setor', l.setor,
          'numero', l.numero,
          'tipos_obra', l.tipos_obra,
          'escopo', l.escopo,
          'situacao', case
            when l.situacao = 'cancelada' then 'cancelada'
            when l.concluida_em is not null then 'concluida'
            when hoje.d < l.inicio_previsto then 'aguardando_inicio'
            when hoje.d > l.fim_previsto then 'prazo_encerrado'
            else 'vigente' end,
          'inicio_previsto', l.inicio_previsto,
          'fim_previsto', l.fim_previsto,
          'decisao_data', l.decisao_data,
          'executora', coalesce(nullif(btrim(ex.nome_fantasia), ''), ex.razao_social, l.executora_razao_social),
          'contratante', coalesce(nullif(btrim(co.nome_fantasia), ''), co.razao_social,
                                  case when l.contratante_cpf is null then l.contratante_razao_social end),
          'logradouro', t.logradouro,
          'bairro', t.bairro)
      ) as feature
      from public.licencas l
      cross join hoje
      join public.licenca_trechos t on t.licenca_id = l.id
      left join public.empresas ex on ex.id = l.executora_id
      left join public.empresas co on co.id = l.contratante_id
     where l.situacao in ('deferida', 'cancelada')
  ) f;
$$;

revoke execute on function public.obras_geojson() from public;
grant  execute on function public.obras_geojson() to anon, authenticated;
