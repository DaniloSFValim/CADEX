-- =====================================================================
-- CADEX — tipo de intervenção (obra ou serviço), origem institucional e
-- obras públicas contratadas pela Prefeitura ou por autarquia
--
-- * licencas.tipo_intervencao: 'obra' | 'servico' (obrigatório; as licenças
--   que já existem ficam como 'obra', o que era o sentido do registro).
-- * licencas.origem_intervencao: quem origina a intervenção:
--     concessionaria  concessionária ou prestadora de serviço (o que já existia)
--     municipio       Prefeitura ou órgão municipal da administração direta
--     autarquia       autarquia municipal
--     outro_ente      órgão estadual ou federal (já podia contratar; não some)
--   A origem pública exige o órgão contratante certo, cadastrado em
--   orgaos_publicos; a concessionária não aceita órgão. Licença que já tinha
--   órgão contratante é classificada pela esfera do órgão.
-- * orgaos_publicos.natureza distingue administração direta de autarquia.
-- * Dados contratuais opcionais: contrato, processo administrativo, ordem de
--   serviço e objeto. Não entram nas listas públicas.
-- * Mapa e dados abertos passam a informar tipo e origem. A seleção (quem
--   aparece) não muda aqui.
--
-- A regra de origem vale para registro novo ou que mude de origem/órgão.
-- Reversão: remover o gatilho licencas_valida_origem e as colunas novas; os
-- demais dados não são tocados. Sem DROP de dados existentes.
-- =====================================================================

alter table public.orgaos_publicos
  add column if not exists natureza text not null default 'administracao_direta'
    check (natureza in ('administracao_direta', 'autarquia'));

alter table public.licencas
  add column if not exists tipo_intervencao text not null default 'obra'
    check (tipo_intervencao in ('obra', 'servico')),
  add column if not exists origem_intervencao text not null default 'concessionaria'
    check (origem_intervencao in ('concessionaria', 'municipio', 'autarquia', 'outro_ente')),
  add column if not exists contrato_numero text,
  add column if not exists processo_administrativo text,
  add column if not exists ordem_servico_numero text,
  add column if not exists objeto_contrato text;

update public.licencas l
   set origem_intervencao = case when og.esfera = 'municipal' then 'municipio' else 'outro_ente' end
  from public.orgaos_publicos og
 where og.id = l.orgao_contratante_id and l.origem_intervencao = 'concessionaria';

create or replace function public.licencas_valida_origem()
returns trigger language plpgsql security definer
set search_path = public as $$
declare og public.orgaos_publicos;
begin
  new.contrato_numero         := nullif(btrim(new.contrato_numero), '');
  new.processo_administrativo := nullif(btrim(new.processo_administrativo), '');
  new.ordem_servico_numero    := nullif(btrim(new.ordem_servico_numero), '');
  new.objeto_contrato         := nullif(btrim(new.objeto_contrato), '');

  if tg_op = 'UPDATE'
     and new.origem_intervencao is not distinct from old.origem_intervencao
     and new.orgao_contratante_id is not distinct from old.orgao_contratante_id then
    return new;
  end if;

  if new.origem_intervencao = 'concessionaria' then
    if new.orgao_contratante_id is not null then
      raise exception 'Intervenção de concessionária ou prestadora não tem órgão público como contratante. Ajuste a origem da intervenção.';
    end if;
    return new;
  end if;

  if new.orgao_contratante_id is null then
    raise exception 'Obra ou serviço público: escolha o órgão ou a autarquia contratante.';
  end if;
  select * into og from orgaos_publicos where id = new.orgao_contratante_id;
  if new.origem_intervencao = 'municipio' and not (og.esfera = 'municipal' and og.natureza = 'administracao_direta') then
    raise exception 'A origem "Prefeitura ou órgão municipal" exige um órgão municipal da administração direta.';
  elsif new.origem_intervencao = 'autarquia' and not (og.esfera = 'municipal' and og.natureza = 'autarquia') then
    raise exception 'A origem "Autarquia municipal" exige uma autarquia municipal cadastrada.';
  elsif new.origem_intervencao = 'outro_ente' and og.esfera = 'municipal' then
    raise exception 'A origem "Órgão estadual ou federal" exige um órgão dessas esferas.';
  end if;
  return new;
end $$;

revoke execute on function public.licencas_valida_origem() from public, anon, authenticated;

create or replace trigger licencas_valida_origem
  before insert or update on public.licencas
  for each row execute function public.licencas_valida_origem();

-- ---------------------------------------------------------------------
-- salvar_licenca: grava os campos novos (cópia de 20261010120000).
-- ---------------------------------------------------------------------
create or replace function public.salvar_licenca(p_licenca jsonb, p_trechos jsonb)
returns uuid language plpgsql security invoker
set search_path = public as $$
declare
  r       public.licencas := jsonb_populate_record(null::public.licencas, p_licenca);
  v_id    uuid := r.id;
  v_sit   text := coalesce(r.situacao, 'em_analise');
  v_ids   uuid[] := '{}';
  v_tid   uuid;
  t       jsonb;
  v_ordem int := 0;
begin
  if v_id is null then
    insert into licencas (setor, processo_sei, numero, tipos_obra, escopo, executora_id, executora_razao_social,
                          executora_cnpj, contratante_id, orgao_contratante_id, contratante_razao_social, contratante_cnpj,
                          contratante_cpf, imovel_endereco, processo_urbanismo, subcontratada_id, responsavel_tecnico_id, art_numero, protocolo_data,
                          situacao, decisao_data, inicio_previsto, fim_previsto, observacoes,
                          tipo_intervencao, origem_intervencao, contrato_numero, processo_administrativo,
                          ordem_servico_numero, objeto_contrato)
    values (r.setor, r.processo_sei, r.numero, r.tipos_obra, r.escopo, r.executora_id, r.executora_razao_social,
            r.executora_cnpj, r.contratante_id, r.orgao_contratante_id, r.contratante_razao_social, r.contratante_cnpj,
            r.contratante_cpf, r.imovel_endereco, r.processo_urbanismo, r.subcontratada_id, r.responsavel_tecnico_id, r.art_numero, r.protocolo_data,
            case when v_sit = 'deferida' then 'em_analise' else v_sit end,
            r.decisao_data, r.inicio_previsto, r.fim_previsto, r.observacoes,
            coalesce(r.tipo_intervencao, 'obra'), coalesce(r.origem_intervencao, 'concessionaria'),
            r.contrato_numero, r.processo_administrativo, r.ordem_servico_numero, r.objeto_contrato)
    returning id into v_id;
  else
    update licencas set
      setor = r.setor, processo_sei = r.processo_sei, numero = r.numero, tipos_obra = r.tipos_obra, escopo = r.escopo,
      executora_id = r.executora_id, executora_razao_social = r.executora_razao_social,
      executora_cnpj = r.executora_cnpj, contratante_id = r.contratante_id,
      orgao_contratante_id = r.orgao_contratante_id,
      contratante_razao_social = r.contratante_razao_social, contratante_cnpj = r.contratante_cnpj,
      contratante_cpf = r.contratante_cpf, imovel_endereco = r.imovel_endereco,
      processo_urbanismo = r.processo_urbanismo,
      subcontratada_id = r.subcontratada_id, responsavel_tecnico_id = r.responsavel_tecnico_id,
      art_numero = r.art_numero, protocolo_data = r.protocolo_data, decisao_data = r.decisao_data,
      inicio_previsto = r.inicio_previsto, fim_previsto = r.fim_previsto, observacoes = r.observacoes,
      tipo_intervencao = coalesce(r.tipo_intervencao, tipo_intervencao),
      origem_intervencao = coalesce(r.origem_intervencao, origem_intervencao),
      contrato_numero = r.contrato_numero, processo_administrativo = r.processo_administrativo,
      ordem_servico_numero = r.ordem_servico_numero, objeto_contrato = r.objeto_contrato
    where id = v_id;
    if not found then
      raise exception 'Licença não encontrada ou sem permissão para alterar.';
    end if;
  end if;

  for t in select * from jsonb_array_elements(coalesce(p_trechos, '[]'::jsonb)) loop
    v_ordem := v_ordem + 1;
    v_tid := nullif(t ->> 'id', '')::uuid;
    if v_tid is null then
      insert into licenca_trechos (licenca_id, ordem, logradouro, bairro, referencia,
                                   inicio_lat, inicio_lng, fim_lat, fim_lng)
      values (v_id, v_ordem, t ->> 'logradouro', nullif(btrim(t ->> 'bairro'), ''),
              nullif(btrim(t ->> 'referencia'), ''),
              (t ->> 'inicio_lat')::numeric, (t ->> 'inicio_lng')::numeric,
              (t ->> 'fim_lat')::numeric, (t ->> 'fim_lng')::numeric)
      returning id into v_tid;
    else
      update licenca_trechos set
        ordem = v_ordem, logradouro = t ->> 'logradouro', bairro = nullif(btrim(t ->> 'bairro'), ''),
        referencia = nullif(btrim(t ->> 'referencia'), ''),
        inicio_lat = (t ->> 'inicio_lat')::numeric, inicio_lng = (t ->> 'inicio_lng')::numeric,
        fim_lat = (t ->> 'fim_lat')::numeric, fim_lng = (t ->> 'fim_lng')::numeric
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

revoke execute on function public.salvar_licenca(jsonb, jsonb) from public, anon;
grant  execute on function public.salvar_licenca(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Consulta pública e dados abertos: tipo e origem.
-- ---------------------------------------------------------------------
create or replace function public.obras_publicas()
returns jsonb language sql stable security definer
set search_path = public as $$
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
      'decisao_data', l.decisao_data,
      'situacao', case
        when l.situacao = 'cancelada' then 'cancelada'
        when l.concluida_em is not null then 'concluida'
        when hoje.d < l.inicio_previsto then 'aguardando_inicio'
        when hoje.d > l.fim_previsto then 'prazo_encerrado'
        else 'vigente' end,
      'executora', coalesce(nullif(btrim(ex.nome_fantasia), ''), ex.razao_social, l.executora_razao_social),
      'contratante', coalesce(nullif(btrim(co.nome_fantasia), ''), co.razao_social,
                              nullif(btrim(og.sigla), ''), og.nome,
                              case when l.contratante_cpf is null then l.contratante_razao_social end),
      'trechos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'logradouro', t.logradouro, 'bairro', t.bairro,
                 'inicio', jsonb_build_array(t.inicio_lng, t.inicio_lat),
                 'fim', case when t.fim_lat is null then null else jsonb_build_array(t.fim_lng, t.fim_lat) end)
               order by t.ordem)
          from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    order by l.fim_previsto desc), '[]'::jsonb)
    from public.licencas l
    cross join hoje
    left join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
    left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
   where l.situacao in ('deferida', 'cancelada');
$$;

revoke execute on function public.obras_publicas() from public;
grant  execute on function public.obras_publicas() to anon, authenticated;

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
          'tipo_intervencao', l.tipo_intervencao,
          'origem', l.origem_intervencao,
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
     where l.situacao in ('deferida', 'cancelada')
  ) f;
$$;

revoke execute on function public.obras_geojson() from public;
grant  execute on function public.obras_geojson() to anon, authenticated;

create or replace function public.licenca_publica(p_codigo text)
returns jsonb language sql stable security definer
set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'numero', l.numero,
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
    'situacao', case
      when l.situacao = 'cancelada' then 'cancelada'
      when l.concluida_em is not null then 'concluida'
      when hoje.d < l.inicio_previsto then 'aguardando_inicio'
      when hoje.d > l.fim_previsto then 'prazo_encerrado'
      else 'vigente' end,
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
               'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng, 'fim_lat', t.fim_lat, 'fim_lng', t.fim_lng)
             order by t.ordem)
        from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    from public.licencas l
    cross join hoje
    left join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
    left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
   where l.codigo_publico = lower(btrim(p_codigo))
     and l.situacao in ('deferida', 'cancelada');
$$;

revoke execute on function public.licenca_publica(text) from public;
grant  execute on function public.licenca_publica(text) to anon, authenticated;
