-- =====================================================================
-- Remove a data da decisão do registro da licença.
--
-- Ficam só início e fim previstos. A validade de 30 dias passa a contar
-- a partir do início previsto (prorrogação gravada à mão continua valendo).
-- A classificação "anterior à Resolução" passa a usar a data de protocolo.
--
-- Antes de apagar a coluna, o valor vai para licencas_decisao_backup, para
-- a operação ser reversível.
-- =====================================================================

create table if not exists public.licencas_decisao_backup (
  licenca_id   uuid primary key references public.licencas(id) on delete cascade,
  decisao_data date not null,
  copiado_em   timestamptz not null default now()
);
insert into public.licencas_decisao_backup (licenca_id, decisao_data)
select id, decisao_data from public.licencas where decisao_data is not null
on conflict (licenca_id) do nothing;
alter table public.licencas_decisao_backup enable row level security;

drop trigger if exists licencas_validade on public.licencas;
create or replace function public.licencas_validade()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.orgao_contratante_id is not null then
    new.validade_ate := null;
  elsif new.situacao = 'deferida' and new.inicio_previsto is not null then
    -- Sem validade, ou ainda no prazo automático: acompanha o início.
    -- Prorrogação gravada à mão fica intacta.
    if new.validade_ate is null
       or (tg_op = 'UPDATE' and old.validade_ate = old.inicio_previsto + 30
           and new.inicio_previsto is distinct from old.inicio_previsto) then
      new.validade_ate := new.inicio_previsto + 30;
    end if;
  end if;
  return new;
end;
$$;
create trigger licencas_validade
  before insert or update of inicio_previsto, orgao_contratante_id, situacao on public.licencas
  for each row execute function public.licencas_validade();

alter table public.licencas drop column anterior_resolucao;
alter table public.licencas add column anterior_resolucao boolean
  generated always as (public.licenca_anterior_resolucao(protocolo_data)) stored;

create or replace function public.licencas_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_tipo_executora text;
  v_anterior boolean := coalesce(public.licenca_anterior_resolucao(new.protocolo_data), false);
  v_resolucao boolean := new.setor = 'telecom' and not coalesce(public.licenca_anterior_resolucao(new.protocolo_data), false);
begin
  if tg_op = 'UPDATE' and (new.excluida_em is not null or old.excluida_em is not null) then
    new.atualizado_em := now();
    return new;
  end if;
  new.processo_sei  := regexp_replace(upper(btrim(new.processo_sei)), '\s+', ' ', 'g');
  new.numero        := nullif(btrim(new.numero), '');
  new.art_numero    := nullif(btrim(new.art_numero), '');
  new.as_built_sei  := nullif(btrim(new.as_built_sei), '');
  new.executora_razao_social   := nullif(btrim(new.executora_razao_social), '');
  new.contratante_razao_social := nullif(btrim(new.contratante_razao_social), '');
  new.executora_cnpj   := nullif(regexp_replace(coalesce(new.executora_cnpj, ''), '\D', '', 'g'), '');
  new.contratante_cnpj := nullif(regexp_replace(coalesce(new.contratante_cnpj, ''), '\D', '', 'g'), '');
  new.contratante_cpf  := nullif(regexp_replace(coalesce(new.contratante_cpf, ''), '\D', '', 'g'), '');
  new.imovel_endereco    := nullif(btrim(new.imovel_endereco), '');
  new.processo_urbanismo := nullif(btrim(new.processo_urbanismo), '');
  new.atualizado_em := now();

  -- "Indeferida" deixou de ser uma situação registrável. Licença que já está
  -- indeferida continua no histórico e pode ser corrigida sem mudar de situação.
  if new.situacao = 'indeferida' and (tg_op = 'INSERT' or old.situacao is distinct from 'indeferida') then
    raise exception 'A situação "Indeferida" não é mais registrada no CADEX. Licenças já indeferidas permanecem no histórico.';
  end if;

  if not v_anterior and new.executora_razao_social is not null then
    raise exception 'Executora sem cadastro no CADEX só é aceita em licença com protocolo anterior a 09/09/2026. Cadastre a empresa ou corrija a data de protocolo.';
  end if;
  if not v_anterior and new.setor <> 'drenagem' and new.contratante_razao_social is not null then
    raise exception 'Contratante sem cadastro no CADEX só é aceita em drenagem ou em licença com protocolo anterior a 09/09/2026.';
  end if;

  if new.contratante_cpf is not null and (new.contratante_razao_social is null or new.contratante_cnpj is not null) then
    raise exception 'O CPF é só do contratante sem cadastro pessoa física: informe o nome e o CPF, ou o CNPJ.';
  end if;

  if new.setor = 'drenagem' and not v_anterior then
    if new.imovel_endereco is null then
      raise exception 'Drenagem: informe o endereço do imóvel atendido.';
    end if;
    if new.processo_urbanismo is null then
      raise exception 'Drenagem: informe o processo de licenciamento da obra no Urbanismo.';
    end if;
    if new.contratante_razao_social is not null and new.contratante_cpf is null and new.contratante_cnpj is null then
      raise exception 'Drenagem: informe o CPF ou o CNPJ do dono do imóvel.';
    end if;
    if new.contratante_id is null and new.orgao_contratante_id is null and new.contratante_razao_social is null
       and not exists (select 1 from empresas where id = new.executora_id and tipo = 'construtora') then
      raise exception 'Drenagem: informe o dono do imóvel ou a construtora contratante.';
    end if;
  end if;

  if new.executora_id is not null and not public.empresa_atua_no_setor(new.executora_id, new.setor) then
    raise exception 'A executora não atua no setor desta licença. Confira o setor ou os setores da empresa.';
  end if;
  select tipo into v_tipo_executora from empresas where id = new.executora_id;

  if (new.contratante_id is not null)::int
     + (new.orgao_contratante_id is not null)::int
     + (new.contratante_razao_social is not null)::int > 1 then
    raise exception 'Informe só uma contratante: empresa cadastrada, órgão público, ou (nos casos permitidos) o nome por extenso.';
  end if;

  if v_tipo_executora is not null and v_tipo_executora <> 'terceirizada'
     and new.setor <> 'drenagem' and not v_anterior
     and ((new.contratante_id is not null and new.contratante_id is distinct from new.executora_id)
          or new.orgao_contratante_id is not null
          or new.contratante_razao_social is not null) then
    raise exception 'A contratante só se aplica quando a executora é terceirizada. A empresa titular executa a própria obra: deixe em branco ou marque que a própria contratante executa.';
  end if;

  if new.contratante_id is not null then
    -- Contratante igual à executora é a titular executando a própria obra
    -- (mesma pessoa jurídica, um único cadastro). Terceirizada não contrata a si mesma.
    if new.contratante_id = new.executora_id and v_tipo_executora = 'terceirizada' then
      raise exception 'A terceirizada não pode ser a própria contratante.';
    end if;
    if not exists (select 1 from empresas where id = new.contratante_id and tipo <> 'terceirizada') then
      raise exception 'A contratante precisa ser operadora, concessionária ou construtora.';
    end if;
    if not public.empresa_atua_no_setor(new.contratante_id, new.setor) then
      raise exception 'A contratante não atua no setor desta licença.';
    end if;
  elsif new.orgao_contratante_id is not null then
    if exists (select 1 from orgaos_publicos o
                where o.id = new.orgao_contratante_id
                  and cardinality(o.setores) > 0
                  and not (new.setor = any(o.setores))) then
      raise exception 'O órgão contratante não atua no setor desta licença.';
    end if;
  elsif v_tipo_executora = 'terceirizada' and new.contratante_razao_social is null and not v_anterior then
    raise exception 'Executora terceirizada: informe a contratante (empresa ou órgão público).';
  end if;

  if new.subcontratada_id is not null then
    if new.subcontratada_id in (new.executora_id, new.contratante_id) then
      raise exception 'A subcontratada precisa ser outra empresa.';
    end if;
    if not public.empresa_atua_no_setor(new.subcontratada_id, new.setor) then
      raise exception 'A subcontratada não atua no setor desta licença.';
    end if;
    if v_resolucao and not exists (
         select 1 from vinculos where contratante_id = new.executora_id
            and contratada_id = new.subcontratada_id and fim is null) then
      raise exception 'A subcontratada não tem vínculo ativo com a executora. Registre o vínculo na página da empresa.';
    end if;
  end if;

  if new.responsavel_tecnico_id is not null and not exists (
       select 1 from responsaveis_tecnicos where id = new.responsavel_tecnico_id
          and empresa_id in (new.executora_id, new.subcontratada_id)) then
    raise exception 'O responsável técnico precisa ser da executora ou da subcontratada.';
  end if;

  if new.situacao = 'deferida' and new.inicio_previsto is not null and new.inicio_previsto < new.protocolo_data then
    raise exception 'O início da obra ou serviço não pode ser anterior ao protocolo.';
  end if;
  if new.fim_previsto < new.inicio_previsto then
    raise exception 'O fim da obra ou serviço não pode ser anterior ao início.';
  end if;

  if tg_op = 'UPDATE' and old.situacao = 'deferida' and new.situacao in ('em_analise', 'indeferida') then
    raise exception 'Licença deferida só pode ser cancelada.';
  end if;

  if new.situacao = 'deferida' then
    if new.numero is null then raise exception 'Informe o número da licença.'; end if;
    if new.inicio_previsto is null or new.fim_previsto is null then
      raise exception 'Informe o início e o fim da obra ou serviço.';
    end if;
    if not exists (select 1 from licenca_trechos where licenca_id = new.id) then
      raise exception 'Cadastre ao menos um trecho antes de deferir.';
    end if;

    if tg_op = 'INSERT' or old.situacao <> 'deferida'
       or new.executora_id is distinct from old.executora_id
       or new.subcontratada_id is distinct from old.subcontratada_id
       or new.contratante_id is distinct from old.contratante_id
       or new.orgao_contratante_id is distinct from old.orgao_contratante_id
       or new.setor is distinct from old.setor then
      new.empresas_no_deferimento := jsonb_build_object(
        'em', now(),
        'anterior_resolucao', v_anterior,
        'setor', new.setor,
        'executora', coalesce(public.empresa_resumo(new.executora_id),
                              jsonb_build_object('razao_social', new.executora_razao_social, 'cnpj', new.executora_cnpj)),
        'contratante', coalesce(
          public.empresa_resumo(new.contratante_id),
          (select jsonb_build_object('orgao', true, 'nome', o.nome, 'sigla', o.sigla,
                                     'esfera', o.esfera, 'cnpj', o.cnpj)
             from orgaos_publicos o where o.id = new.orgao_contratante_id),
          case when new.contratante_razao_social is not null then
            jsonb_build_object('razao_social', new.contratante_razao_social, 'cnpj', new.contratante_cnpj,
                               'cpf', new.contratante_cpf) end),
        'subcontratada', public.empresa_resumo(new.subcontratada_id));
    end if;
  elsif new.situacao <> 'cancelada' then
    new.empresas_no_deferimento := null;
  end if;

  if new.concluida_em is not null then
    if new.situacao <> 'deferida' then
      raise exception 'Só obra de licença deferida pode ser concluída.';
    end if;
    if new.concluida_em < new.inicio_previsto then
      raise exception 'A conclusão não pode ser anterior ao início da obra ou serviço.';
    end if;
  else
    -- Sem conclusão não há recomposição a registrar.
    new.recomposicao_data := null;
  end if;
  if new.recomposicao_data is not null and new.concluida_em is not null
     and new.recomposicao_data < new.concluida_em then
    raise exception 'A recomposição do pavimento não pode ser anterior à conclusão da obra.';
  end if;

  if (new.as_built_sei is not null or new.as_built_data is not null) and new.concluida_em is null then
    raise exception 'Registre a conclusão da obra antes do As Built.';
  end if;
  if (new.as_built_sei is null) <> (new.as_built_data is null) then
    raise exception 'Informe o nº do documento e a data do As Built.';
  end if;

  return new;
end;
$$;

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
  v_ordem int := 0;
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
      ordem_servico_numero = r.ordem_servico_numero, objeto_contrato = r.objeto_contrato
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
    if v_tid is null then
      insert into licenca_trechos (licenca_id, ordem, logradouro, bairro, referencia,
                                   inicio_lat, inicio_lng, fim_lat, fim_lng, area)
      values (v_id, v_ordem, t ->> 'logradouro', nullif(btrim(t ->> 'bairro'), ''),
              nullif(btrim(t ->> 'referencia'), ''),
              (t ->> 'inicio_lat')::numeric, (t ->> 'inicio_lng')::numeric,
              (t ->> 'fim_lat')::numeric, (t ->> 'fim_lng')::numeric, v_area)
      returning id into v_tid;
    else
      update licenca_trechos set
        ordem = v_ordem, logradouro = t ->> 'logradouro', bairro = nullif(btrim(t ->> 'bairro'), ''),
        referencia = nullif(btrim(t ->> 'referencia'), ''),
        inicio_lat = (t ->> 'inicio_lat')::numeric, inicio_lng = (t ->> 'inicio_lng')::numeric,
        fim_lat = (t ->> 'fim_lat')::numeric, fim_lng = (t ->> 'fim_lng')::numeric,
        area = v_area
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
  ) f;
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
      'situacao', case
        when l.situacao = 'cancelada' then 'cancelada'
        when l.concluida_em is not null then 'concluida'
        when l.orgao_contratante_id is not null then 'registro'
        when l.validade_ate is not null and hoje.d > l.validade_ate then 'prazo_encerrado'
        when hoje.d < l.inicio_previsto then 'aguardando_inicio'
        else 'vigente' end,
      'executora', coalesce(nullif(btrim(ex.nome_fantasia), ''), ex.razao_social, l.executora_razao_social),
      'contratante', coalesce(nullif(btrim(co.nome_fantasia), ''), co.razao_social,
                              nullif(btrim(og.sigla), ''), og.nome,
                              case when l.contratante_cpf is null then l.contratante_razao_social end),
      'trechos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'logradouro', t.logradouro, 'bairro', t.bairro,
                 'inicio', jsonb_build_array(t.inicio_lng, t.inicio_lat),
                 'fim', case when t.fim_lat is null then null else jsonb_build_array(t.fim_lng, t.fim_lat) end,
                 'area', case when t.area is null then null else ST_AsGeoJSON(t.area)::jsonb end)
               order by t.ordem)
          from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    order by l.fim_previsto desc), '[]'::jsonb)
    from public.licencas l
    cross join hoje
    left join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
    left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
   where l.situacao in ('deferida', 'cancelada') and l.excluida_em is null;
$$;

alter table public.licencas drop column decisao_data;
