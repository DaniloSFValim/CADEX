-- =====================================================================
-- CADEX — licenças dos outros setores (gás, saneamento, drenagem e
-- construção civil)
--
--   setor          obrigatório; as que já existem são de telecom
--   tipos de obra  além do art. 10: ligação de imóvel à rede pública,
--                  galeria ou rede de drenagem, boca de lobo e
--                  recomposição de calçada ou pavimento
--   empresas       executora, contratante e subcontratada precisam atuar
--                  no setor da licença
--   Resolução      APTA, ART da obra, vínculo da subcontratada e
--                  contratante obrigatória para terceirizada só valem
--                  para telecom com decisão a partir de 09/09/2026
--   drenagem       ligação de imóvel particular à rede pública: exige o
--                  endereço do imóvel e o processo de licenciamento da
--                  obra no Urbanismo; o contratante pode ser o dono do
--                  imóvel sem cadastro, com CPF ou CNPJ. Nome de pessoa
--                  física (CPF) não aparece nas páginas públicas.
-- =====================================================================

alter table public.licencas
  add column setor text not null default 'telecom'
    check (setor in ('telecom', 'gas', 'saneamento', 'drenagem', 'construcao'));
alter table public.licencas alter column setor drop default;

alter table public.licencas
  add column contratante_cpf    text check (contratante_cpf is null or (contratante_cpf ~ '^\d{11}$' and public.cpf_valido(contratante_cpf))),
  add column imovel_endereco    text,
  add column processo_urbanismo text;

alter table public.licencas drop constraint licencas_tipos_obra_check;
alter table public.licencas add constraint licencas_tipos_obra_check
  check (cardinality(tipos_obra) > 0
         and tipos_obra <@ array['vala', 'escavacao', 'perfuracao_nao_destrutiva', 'poste', 'rede',
                                 'ligacao_predial', 'galeria_drenagem', 'boca_de_lobo', 'recomposicao']);

-- A empresa atua no setor? Operadora: telecom. Concessionária: o seu.
-- Construtora: construção e drenagem (executa ligações). Terceirizada:
-- os setores marcados no cadastro.
create or replace function public.empresa_atua_no_setor(p_empresa uuid, p_setor text)
returns boolean language sql stable
set search_path = public as $$
  select case e.tipo
    when 'construtora' then p_setor in ('construcao', 'drenagem')
    else p_setor = any(e.setores) end
    from public.empresas e where e.id = p_empresa;
$$;

revoke execute on function public.empresa_atua_no_setor(uuid, text) from public, anon;
grant  execute on function public.empresa_atua_no_setor(uuid, text) to authenticated;

create or replace function public.licencas_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_tipo_executora text;
  v_anterior boolean := coalesce(public.licenca_anterior_resolucao(new.decisao_data), false);
  -- Regras da Resolução (APTA, ART, vínculo da subcontratada, contratante
  -- obrigatória): só telecom com decisão a partir de 09/09/2026.
  v_resolucao boolean := new.setor = 'telecom' and not coalesce(public.licenca_anterior_resolucao(new.decisao_data), false);
begin
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

  -- Empresa sem cadastro: executora só em licença anterior à Resolução;
  -- contratante também na drenagem, onde quem contrata costuma ser o dono
  -- do imóvel.
  if not v_anterior and new.executora_razao_social is not null then
    raise exception 'Executora sem cadastro no CADEX só é aceita em licença com decisão anterior a 09/09/2026. Cadastre a empresa ou corrija a data da decisão.';
  end if;
  if not v_anterior and new.setor <> 'drenagem' and new.contratante_razao_social is not null then
    raise exception 'Contratante sem cadastro no CADEX só é aceita em drenagem ou em licença com decisão anterior a 09/09/2026.';
  end if;

  if new.contratante_cpf is not null and (new.contratante_razao_social is null or new.contratante_cnpj is not null) then
    raise exception 'O CPF é só do contratante sem cadastro pessoa física: informe o nome e o CPF, ou o CNPJ.';
  end if;

  -- Drenagem (ligação de imóvel particular à rede pública): imóvel,
  -- processo no Urbanismo e quem contratou, com CPF ou CNPJ. Dispensa o
  -- contratante quando a própria construtora executa.
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
    if new.contratante_id is null and new.contratante_razao_social is null
       and not exists (select 1 from empresas where id = new.executora_id and tipo = 'construtora') then
      raise exception 'Drenagem: informe o dono do imóvel ou a construtora contratante.';
    end if;
  end if;

  -- Partes (art. 2º, II, III e VIII): todas atuam no setor da licença.
  if new.executora_id is not null and not public.empresa_atua_no_setor(new.executora_id, new.setor) then
    raise exception 'A executora não atua no setor desta licença. Confira o setor ou os setores da empresa.';
  end if;
  select tipo into v_tipo_executora from empresas where id = new.executora_id;
  if new.contratante_id is not null then
    if new.contratante_id = new.executora_id then
      raise exception 'A contratante não pode ser a própria executora.';
    end if;
    if not exists (select 1 from empresas where id = new.contratante_id and tipo <> 'terceirizada') then
      raise exception 'A contratante precisa ser operadora, concessionária ou construtora.';
    end if;
    if not public.empresa_atua_no_setor(new.contratante_id, new.setor) then
      raise exception 'A contratante não atua no setor desta licença.';
    end if;
  elsif v_tipo_executora = 'terceirizada' and new.contratante_razao_social is null and v_resolucao then
    raise exception 'Executora terceirizada: informe a concessionária contratante.';
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

  -- Datas
  if new.decisao_data < new.protocolo_data then
    raise exception 'A data da decisão não pode ser anterior ao protocolo.';
  end if;
  if new.fim_previsto < new.inicio_previsto then
    raise exception 'O fim do cronograma não pode ser anterior ao início.';
  end if;

  -- Situação
  if tg_op = 'UPDATE' and old.situacao = 'deferida' and new.situacao in ('em_analise', 'indeferida') then
    raise exception 'Licença deferida só pode ser cancelada.';
  end if;

  if new.situacao in ('deferida', 'indeferida') and new.decisao_data is null then
    raise exception 'Informe a data da decisão.';
  end if;

  if new.situacao = 'deferida' then
    if new.numero is null then raise exception 'Informe o número da licença.'; end if;
    if new.inicio_previsto is null or new.fim_previsto is null then
      raise exception 'Informe o início e o fim do cronograma.';
    end if;
    if new.art_numero is null and v_resolucao then raise exception 'Informe a ART/RRT da obra.'; end if;
    if not exists (select 1 from licenca_trechos where licenca_id = new.id) then
      raise exception 'Cadastre ao menos um trecho antes de deferir.';
    end if;

    if tg_op = 'INSERT' or old.situacao <> 'deferida'
       or new.executora_id is distinct from old.executora_id
       or new.subcontratada_id is distinct from old.subcontratada_id
       or new.decisao_data is distinct from old.decisao_data
       or new.setor is distinct from old.setor then
      -- Arts. 4º e 8º, § 2º: só empresa apta requer licença (regra da Resolução).
      if v_resolucao then
        if (public.empresa_resumo(new.executora_id) ->> 'situacao') not in ('apta', 'em_saneamento') then
          raise exception 'A executora não está APTA no CADEX: a licença não pode ser deferida.';
        end if;
        if new.subcontratada_id is not null
           and (public.empresa_resumo(new.subcontratada_id) ->> 'situacao') not in ('apta', 'em_saneamento') then
          raise exception 'A subcontratada não está APTA no CADEX (art. 3º, § 1º): a licença não pode ser deferida.';
        end if;
      end if;
      new.empresas_no_deferimento := jsonb_build_object(
        'em', now(),
        'anterior_resolucao', v_anterior,
        'setor', new.setor,
        'executora', coalesce(public.empresa_resumo(new.executora_id),
                              jsonb_build_object('razao_social', new.executora_razao_social, 'cnpj', new.executora_cnpj)),
        'contratante', coalesce(public.empresa_resumo(new.contratante_id),
                                case when new.contratante_razao_social is not null then
                                  jsonb_build_object('razao_social', new.contratante_razao_social, 'cnpj', new.contratante_cnpj,
                                                     'cpf', new.contratante_cpf) end),
        'subcontratada', public.empresa_resumo(new.subcontratada_id));
    end if;
  elsif new.situacao <> 'cancelada' then
    new.empresas_no_deferimento := null;
  end if;

  -- Conclusão e As Built (art. 26)
  if new.concluida_em is not null then
    if new.situacao <> 'deferida' then
      raise exception 'Só obra de licença deferida pode ser concluída.';
    end if;
    if new.concluida_em < new.inicio_previsto then
      raise exception 'A conclusão não pode ser anterior ao início do cronograma.';
    end if;
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

revoke execute on function public.licencas_antes_de_gravar() from public, anon, authenticated;

-- Gravação: passa a levar o setor e os dados da drenagem.
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
                          executora_cnpj, contratante_id, contratante_razao_social, contratante_cnpj,
                          contratante_cpf, imovel_endereco, processo_urbanismo, subcontratada_id, responsavel_tecnico_id, art_numero, protocolo_data,
                          situacao, decisao_data, inicio_previsto, fim_previsto, observacoes)
    values (r.setor, r.processo_sei, r.numero, r.tipos_obra, r.escopo, r.executora_id, r.executora_razao_social,
            r.executora_cnpj, r.contratante_id, r.contratante_razao_social, r.contratante_cnpj,
            r.contratante_cpf, r.imovel_endereco, r.processo_urbanismo, r.subcontratada_id, r.responsavel_tecnico_id, r.art_numero, r.protocolo_data,
            case when v_sit = 'deferida' then 'em_analise' else v_sit end,
            r.decisao_data, r.inicio_previsto, r.fim_previsto, r.observacoes)
    returning id into v_id;
  else
    update licencas set
      setor = r.setor, processo_sei = r.processo_sei, numero = r.numero, tipos_obra = r.tipos_obra, escopo = r.escopo,
      executora_id = r.executora_id, executora_razao_social = r.executora_razao_social,
      executora_cnpj = r.executora_cnpj, contratante_id = r.contratante_id,
      contratante_razao_social = r.contratante_razao_social, contratante_cnpj = r.contratante_cnpj,
      contratante_cpf = r.contratante_cpf, imovel_endereco = r.imovel_endereco,
      processo_urbanismo = r.processo_urbanismo,
      subcontratada_id = r.subcontratada_id, responsavel_tecnico_id = r.responsavel_tecnico_id,
      art_numero = r.art_numero, protocolo_data = r.protocolo_data, decisao_data = r.decisao_data,
      inicio_previsto = r.inicio_previsto, fim_previsto = r.fim_previsto, observacoes = r.observacoes
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
    situacao = v_sit, concluida_em = r.concluida_em,
    as_built_sei = r.as_built_sei, as_built_data = r.as_built_data
  where id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.salvar_licenca(jsonb, jsonb) from public, anon;
grant  execute on function public.salvar_licenca(jsonb, jsonb) to authenticated;

-- Página pública: setor e endereço do imóvel (drenagem).
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
   where l.codigo_publico = lower(btrim(p_codigo))
     and l.situacao in ('deferida', 'cancelada');
$$;

revoke execute on function public.licenca_publica(text) from public;
grant  execute on function public.licenca_publica(text) to anon, authenticated;

-- Mapa público: setor; sem o nome de contratante pessoa física.
create or replace function public.obras_publicas()
returns jsonb language sql stable security definer
set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', l.codigo_publico,
      'setor', l.setor,
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
   where l.situacao in ('deferida', 'cancelada');
$$;

revoke execute on function public.obras_publicas() from public;
grant  execute on function public.obras_publicas() to anon, authenticated;
