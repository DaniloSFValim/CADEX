-- =====================================================================
-- CADEX — um trecho pode ter vários segmentos (ex.: os dois lados da rua).
-- Coluna "segmentos": MultiLineString em 4326, dentro da faixa de Niterói.
-- Início e fim continuam preenchidos com o primeiro segmento, para as telas
-- e consultas antigas. Quando há segmentos, o mapa público e os dados
-- abertos desenham a MultiLineString inteira.
--
-- Reversão: remover a coluna e recriar as funções sem o campo "segmentos"
-- (versões de 20261127120000, 20261124120000 e 20261129120000).
-- =====================================================================

alter table public.licenca_trechos
  add column if not exists segmentos geometry(MultiLineString, 4326),
  add constraint licenca_trechos_segmentos_niteroi check (
    segmentos is null or (
      ST_IsValid(segmentos)
      and ST_XMin(segmentos) >= -43.25 and ST_XMax(segmentos) <= -42.85
      and ST_YMin(segmentos) >= -23.10 and ST_YMax(segmentos) <= -22.75));

create index if not exists licenca_trechos_segmentos_idx on public.licenca_trechos using gist (segmentos);

create or replace function public.salvar_licenca(p_licenca jsonb, p_trechos jsonb)
returns uuid language plpgsql security invoker
set search_path = public, extensions as $$
declare
  r       public.licencas := jsonb_populate_record(null::public.licencas, p_licenca);
  v_id    uuid := r.id;
  v_sit   text := coalesce(r.situacao, 'em_analise');
  v_ids   uuid[] := '{}';
  v_tid   uuid;
  t       jsonb;
  v_area  geometry;
  v_segs  geometry;
  v_ordem int := 0;
  v_conclui_junto boolean := false;
  v_atualizado timestamptz;
  v_esperado timestamptz;
begin
  if v_id is null then
    insert into licencas (setor, processo_sei, numero, tipos_obra, outros_descricao, escopo, executora_id, executora_razao_social,
                          executora_cnpj, contratante_id, orgao_contratante_id, contratante_razao_social, contratante_cnpj,
                          contratante_cpf, imovel_endereco, processo_urbanismo, subcontratada_id, responsavel_tecnico_id, art_numero, protocolo_data,
                          situacao, inicio_previsto, fim_previsto, observacoes,
                          tipo_intervencao, origem_intervencao, contrato_numero, processo_administrativo,
                          ordem_servico_numero, objeto_contrato)
    values (r.setor, r.processo_sei, r.numero, r.tipos_obra, r.outros_descricao, r.escopo, r.executora_id, r.executora_razao_social,
            r.executora_cnpj, r.contratante_id, r.orgao_contratante_id, r.contratante_razao_social, r.contratante_cnpj,
            r.contratante_cpf, r.imovel_endereco, r.processo_urbanismo, r.subcontratada_id, r.responsavel_tecnico_id, r.art_numero, r.protocolo_data,
            case when v_sit = 'deferida' then 'em_analise' else v_sit end,
            r.inicio_previsto, r.fim_previsto, r.observacoes,
            coalesce(r.tipo_intervencao, 'obra'), coalesce(r.origem_intervencao, 'concessionaria'),
            r.contrato_numero, r.processo_administrativo, r.ordem_servico_numero, r.objeto_contrato)
    returning id into v_id;
  else
    -- Quem editou a partir de uma versão antiga não sobrescreve o que outra pessoa já salvou.
    -- A data de alteração vem da tela; a linha fica travada até o fim da gravação.
    select l.atualizado_em into v_atualizado from licencas l where l.id = v_id for update;
    if not found then
      raise exception 'Licença não encontrada ou sem permissão para alterar.';
    end if;
    v_esperado := nullif(p_licenca ->> 'atualizado_em_esperado', '')::timestamptz;
    if v_esperado is not null and v_atualizado is distinct from v_esperado then
      raise exception 'Esta licença foi alterada por outra pessoa enquanto você editava. Recarregue a página e confira as alterações antes de salvar.'
        using errcode = '40001';
    end if;
    select (l.situacao = 'deferida' and v_sit = 'deferida') or r.concluida_em is null
      into v_conclui_junto from licencas l where l.id = v_id;
    v_conclui_junto := coalesce(v_conclui_junto, false);
    update licencas set
      setor = r.setor, processo_sei = r.processo_sei, numero = r.numero, tipos_obra = r.tipos_obra,
      outros_descricao = r.outros_descricao, escopo = r.escopo,
      executora_id = r.executora_id, executora_razao_social = r.executora_razao_social,
      executora_cnpj = r.executora_cnpj, contratante_id = r.contratante_id,
      orgao_contratante_id = r.orgao_contratante_id,
      contratante_razao_social = r.contratante_razao_social, contratante_cnpj = r.contratante_cnpj,
      contratante_cpf = r.contratante_cpf, imovel_endereco = r.imovel_endereco,
      processo_urbanismo = r.processo_urbanismo,
      subcontratada_id = r.subcontratada_id, responsavel_tecnico_id = r.responsavel_tecnico_id,
      art_numero = r.art_numero, protocolo_data = r.protocolo_data,
      inicio_previsto = r.inicio_previsto, fim_previsto = r.fim_previsto, observacoes = r.observacoes,
      tipo_intervencao = coalesce(r.tipo_intervencao, tipo_intervencao),
      origem_intervencao = coalesce(r.origem_intervencao, origem_intervencao),
      contrato_numero = r.contrato_numero, processo_administrativo = r.processo_administrativo,
      ordem_servico_numero = r.ordem_servico_numero, objeto_contrato = r.objeto_contrato,
      -- Conclusão e datas ligadas a ela entram junto com o início quando a licença já é deferida e
      -- continua deferida, ou quando a conclusão está sendo retirada. Gravadas só no fim, o banco
      -- comparava o início novo com a conclusão antiga e recusava uma correção válida.
      concluida_em = case when v_conclui_junto then r.concluida_em else concluida_em end,
      recomposicao_data = case when v_conclui_junto then r.recomposicao_data else recomposicao_data end,
      as_built_sei = case when v_conclui_junto then r.as_built_sei else as_built_sei end,
      as_built_data = case when v_conclui_junto then r.as_built_data else as_built_data end
    where id = v_id;
    if not found then
      raise exception 'Licença não encontrada ou sem permissão para alterar.';
    end if;
  end if;

  for t in select * from jsonb_array_elements(coalesce(p_trechos, '[]'::jsonb)) loop
    v_ordem := v_ordem + 1;
    v_tid := nullif(t ->> 'id', '')::uuid;
    v_area := case when nullif(t ->> 'area', '') is null then null
                   else ST_SetSRID(ST_GeomFromGeoJSON(t ->> 'area'), 4326) end;
    v_segs := case when nullif(t ->> 'segmentos', '') is null then null
                   else ST_SetSRID(ST_GeomFromGeoJSON(t ->> 'segmentos'), 4326) end;
    if v_tid is null then
      insert into licenca_trechos (licenca_id, ordem, logradouro, bairro, referencia,
                                   inicio_lat, inicio_lng, fim_lat, fim_lng, area, segmentos)
      values (v_id, v_ordem, t ->> 'logradouro', nullif(btrim(t ->> 'bairro'), ''),
              nullif(btrim(t ->> 'referencia'), ''),
              (t ->> 'inicio_lat')::numeric, (t ->> 'inicio_lng')::numeric,
              (t ->> 'fim_lat')::numeric, (t ->> 'fim_lng')::numeric, v_area, v_segs)
      returning id into v_tid;
    else
      update licenca_trechos set
        ordem = v_ordem, logradouro = t ->> 'logradouro', bairro = nullif(btrim(t ->> 'bairro'), ''),
        referencia = nullif(btrim(t ->> 'referencia'), ''),
        inicio_lat = (t ->> 'inicio_lat')::numeric, inicio_lng = (t ->> 'inicio_lng')::numeric,
        fim_lat = (t ->> 'fim_lat')::numeric, fim_lng = (t ->> 'fim_lng')::numeric,
        area = v_area, segmentos = v_segs
      where id = v_tid and licenca_id = v_id;
      if not found then
        raise exception 'Trecho não pertence a esta licença.';
      end if;
    end if;
    v_ids := v_ids || v_tid;
  end loop;

  delete from licenca_trechos where licenca_id = v_id and id <> all(v_ids);

  update licencas set
    situacao = v_sit, concluida_em = r.concluida_em, recomposicao_data = r.recomposicao_data,
    as_built_sei = r.as_built_sei, as_built_data = r.as_built_data
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.obras_publicas()
returns jsonb language sql stable security definer
set search_path = public, extensions as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', l.codigo_publico,
      'setor', l.setor,
      'tipo_intervencao', l.tipo_intervencao,
      'origem', l.origem_intervencao,
      'numero', l.numero,
      'tipos_obra', l.tipos_obra,
      'escopo', l.escopo,
      'inicio_previsto', l.inicio_previsto,
      'fim_previsto', l.fim_previsto,
            'validade_ate', l.validade_ate,
      'situacao', public.situacao_publica(l, hoje.d, exists (select 1 from public.licenca_suspensoes s where s.licenca_id = l.id and s.fim is null)),
      'executora', coalesce(nullif(btrim(ex.nome_fantasia), ''), ex.razao_social, l.executora_razao_social),
      'contratante', coalesce(nullif(btrim(co.nome_fantasia), ''), co.razao_social,
                              nullif(btrim(og.sigla), ''), og.nome,
                              case when l.contratante_cpf is null then l.contratante_razao_social end),
      'trechos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'logradouro', t.logradouro, 'bairro', t.bairro,
                 'inicio', jsonb_build_array(t.inicio_lng, t.inicio_lat),
                 'fim', case when t.fim_lat is null then null else jsonb_build_array(t.fim_lng, t.fim_lat) end,
                 'area', case when t.area is null then null else ST_AsGeoJSON(t.area)::jsonb end,
                 'segmentos', case when t.segmentos is null then null else ST_AsGeoJSON(t.segmentos)::jsonb end)
               order by t.ordem)
          from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    order by l.fim_previsto desc), '[]'::jsonb)
    from public.licencas l
    cross join hoje
    left join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
    left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
   where l.situacao in ('deferida', 'cancelada') and l.excluida_em is null
     and public.licenca_do_publico(l);
$$;

create or replace function public.obras_geojson()
returns jsonb language sql stable security definer
set search_path = public, extensions as $$
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
          when t.segmentos is not null then ST_AsGeoJSON(t.segmentos)::jsonb
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
          'tipo_intervencao', l.tipo_intervencao,
          'origem', l.origem_intervencao,
          'numero', l.numero,
          'tipos_obra', l.tipos_obra,
          'escopo', l.escopo,
          'situacao', public.situacao_publica(l, hoje.d, exists (select 1 from public.licenca_suspensoes s where s.licenca_id = l.id and s.fim is null)),
          'inicio_previsto', l.inicio_previsto,
          'fim_previsto', l.fim_previsto,
                    'executora', coalesce(nullif(btrim(ex.nome_fantasia), ''), ex.razao_social, l.executora_razao_social),
          'contratante', coalesce(nullif(btrim(co.nome_fantasia), ''), co.razao_social,
                                  nullif(btrim(og.sigla), ''), og.nome,
                                  case when l.contratante_cpf is null then l.contratante_razao_social end),
          'logradouro', t.logradouro,
          'bairro', t.bairro)
      ) as feature
      from public.licencas l
      cross join hoje
      join public.licenca_trechos t on t.licenca_id = l.id
      left join public.empresas ex on ex.id = l.executora_id
      left join public.empresas co on co.id = l.contratante_id
      left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
     where l.situacao in ('deferida', 'cancelada') and l.excluida_em is null
       and public.licenca_do_publico(l)
  ) f;
$$;

create or replace function public.licenca_publica(p_codigo text)
returns jsonb language sql stable security definer
set search_path = public, extensions as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'numero', l.numero,
    'processo_sei', l.processo_sei,
    'tipos_obra', l.tipos_obra,
    'escopo', l.escopo,
    'inicio_previsto', l.inicio_previsto,
    'fim_previsto', l.fim_previsto,
    'concluida_em', l.concluida_em,
    'setor', l.setor,
    'tipo_intervencao', l.tipo_intervencao,
    'origem', l.origem_intervencao,
    'imovel_endereco', l.imovel_endereco,
    'anterior_resolucao', l.anterior_resolucao and l.setor = 'telecom',
    'situacao', public.situacao_publica(l, hoje.d, exists (select 1 from public.licenca_suspensoes s where s.licenca_id = l.id and s.fim is null)),
    'hoje', hoje.d,
    'executora', case
      when ex.id is not null then jsonb_build_object(
        'razao_social', ex.razao_social, 'nome_fantasia', ex.nome_fantasia, 'codigo_cadex', ex.codigo_cadex,
        'situacao_cadex', public.situacao_efetiva(ex.situacao, ex.validade_ate))
      else jsonb_build_object('razao_social', l.executora_razao_social, 'nome_fantasia', null,
                              'codigo_cadex', null, 'situacao_cadex', null) end,
    'contratante', case
      when co.id is not null then jsonb_build_object(
        'razao_social', co.razao_social, 'nome_fantasia', co.nome_fantasia, 'codigo_cadex', co.codigo_cadex)
      -- Órgão público contratante: a sigla aparece como "nome fantasia".
      when og.id is not null then jsonb_build_object(
        'razao_social', og.nome, 'nome_fantasia', og.sigla, 'codigo_cadex', null)
      -- Pessoa física (CPF): o nome não é publicado (LGPD).
      when l.contratante_razao_social is not null and l.contratante_cpf is null then jsonb_build_object(
        'razao_social', l.contratante_razao_social, 'nome_fantasia', null, 'codigo_cadex', null) end,
    'trechos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'logradouro', t.logradouro, 'bairro', t.bairro, 'referencia', t.referencia,
               'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng, 'fim_lat', t.fim_lat, 'fim_lng', t.fim_lng,
               'segmentos', case when t.segmentos is null then null else ST_AsGeoJSON(t.segmentos)::jsonb end)
             order by t.ordem)
        from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    from public.licencas l
    cross join hoje
    left join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
    left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
   where l.codigo_publico = lower(btrim(p_codigo))
     and l.situacao in ('deferida', 'cancelada') and l.excluida_em is null
     and public.licenca_do_publico(l);
$$;

