-- =====================================================================
-- CADEX — recomposição do pavimento (garantia) e detecção de conflito
-- espaço-temporal entre obras.
--
-- Inspirado em sistemas maduros de street works (Reino Unido — Street
-- Manager/NRSWA: garantia de 2 anos na recomposição; 811/one-call:
-- coordenação para não abrir a mesma via duas vezes) e na prática
-- brasileira (Porto Velho/Campinas: prazo e responsabilidade pela
-- recomposição).
--
-- 1. licencas.recomposicao_data: quando o pavimento foi recomposto. Só
--    existe em obra concluída; a GARANTIA corre a partir dela.
-- 2. conflitos_de_licenca(id): avisa (não bloqueia) quando os trechos de
--    uma licença estão a até 15 m de (a) outra obra vigente no mesmo
--    período, ou (b) uma obra concluída ainda dentro da garantia da
--    recomposição. Usa PostGIS (ST_DWithin em geography, metros).
-- =====================================================================

-- PostGIS para a detecção de conflito espacial. Em produção já está
-- instalado (schema extensions); aqui o IF NOT EXISTS é no-op. Local/CI
-- instala para que os ST_* existam ao criar a função abaixo.
create extension if not exists postgis;

alter table public.licencas add column recomposicao_data date;

-- ---------------------------------------------------------------------
-- 1. Gatilho: recomposição só com conclusão e nunca anterior a ela.
--    (Cópia de 20261009140000 com o bloco de recomposição acrescido.)
-- ---------------------------------------------------------------------
create or replace function public.licencas_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_tipo_executora text;
  v_anterior boolean := coalesce(public.licenca_anterior_resolucao(new.decisao_data), false);
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

  if not v_anterior and new.executora_razao_social is not null then
    raise exception 'Executora sem cadastro no CADEX só é aceita em licença com decisão anterior a 09/09/2026. Cadastre a empresa ou corrija a data da decisão.';
  end if;
  if not v_anterior and new.setor <> 'drenagem' and new.contratante_razao_social is not null then
    raise exception 'Contratante sem cadastro no CADEX só é aceita em drenagem ou em licença com decisão anterior a 09/09/2026.';
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
     and (new.contratante_id is not null or new.orgao_contratante_id is not null
          or new.contratante_razao_social is not null) then
    raise exception 'A contratante só se aplica quando a executora é terceirizada. A empresa titular executa a própria obra.';
  end if;

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

  if new.decisao_data < new.protocolo_data then
    raise exception 'A data da decisão não pode ser anterior ao protocolo.';
  end if;
  if new.fim_previsto < new.inicio_previsto then
    raise exception 'O fim do cronograma não pode ser anterior ao início.';
  end if;

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
    if not exists (select 1 from licenca_trechos where licenca_id = new.id) then
      raise exception 'Cadastre ao menos um trecho antes de deferir.';
    end if;

    if tg_op = 'INSERT' or old.situacao <> 'deferida'
       or new.executora_id is distinct from old.executora_id
       or new.subcontratada_id is distinct from old.subcontratada_id
       or new.contratante_id is distinct from old.contratante_id
       or new.orgao_contratante_id is distinct from old.orgao_contratante_id
       or new.decisao_data is distinct from old.decisao_data
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
      raise exception 'A conclusão não pode ser anterior ao início do cronograma.';
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

revoke execute on function public.licencas_antes_de_gravar() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. salvar_licenca: grava recomposicao_data no update final de conclusão.
--    (Cópia de 20261008130000 — lista de colunas explícita.)
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
                          situacao, decisao_data, inicio_previsto, fim_previsto, observacoes)
    values (r.setor, r.processo_sei, r.numero, r.tipos_obra, r.escopo, r.executora_id, r.executora_razao_social,
            r.executora_cnpj, r.contratante_id, r.orgao_contratante_id, r.contratante_razao_social, r.contratante_cnpj,
            r.contratante_cpf, r.imovel_endereco, r.processo_urbanismo, r.subcontratada_id, r.responsavel_tecnico_id, r.art_numero, r.protocolo_data,
            case when v_sit = 'deferida' then 'em_analise' else v_sit end,
            r.decisao_data, r.inicio_previsto, r.fim_previsto, r.observacoes)
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
    situacao = v_sit, concluida_em = r.concluida_em, recomposicao_data = r.recomposicao_data,
    as_built_sei = r.as_built_sei, as_built_data = r.as_built_data
  where id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.salvar_licenca(jsonb, jsonb) from public, anon;
grant  execute on function public.salvar_licenca(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. conflitos_de_licenca: obras a até 15 m, no mesmo período (vigente)
--    ou em garantia de recomposição. Aviso ao gestor — nunca bloqueia.
--    GARANTIA = 24 meses (política; SROH/Reino Unido usa 2 anos).
-- ---------------------------------------------------------------------
create or replace function public.conflitos_de_licenca(p_id uuid)
returns table (
  tipo         text,   -- 'vigente' | 'recomposicao'
  licenca_id   uuid,
  numero       text,
  processo_sei text,
  executora    text,
  distancia_m  int,
  logradouro   text,
  ate          date    -- fim do cronograma (vigente) ou fim da garantia (recomposicao)
)
language sql stable security definer
set search_path = public, extensions as $$
  with alvo as (
    select l.inicio_previsto, l.fim_previsto from licencas l where l.id = p_id
  ),
  alvo_geo as (
    select case when t.fim_lat is not null and t.fim_lng is not null
             then ST_MakeLine(ST_MakePoint(t.inicio_lng, t.inicio_lat), ST_MakePoint(t.fim_lng, t.fim_lat))::geography
             else ST_MakePoint(t.inicio_lng, t.inicio_lat)::geography end as g
      from licenca_trechos t where t.licenca_id = p_id
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  cand as (
    select o.id, o.numero, o.processo_sei, o.situacao, o.concluida_em, o.recomposicao_data,
           o.inicio_previsto, o.fim_previsto,
           coalesce(nullif(btrim(e.nome_fantasia), ''), e.razao_social, o.executora_razao_social) as executora,
           ot.logradouro,
           ceil(min(ST_Distance(ag.g,
             case when ot.fim_lat is not null and ot.fim_lng is not null
               then ST_MakeLine(ST_MakePoint(ot.inicio_lng, ot.inicio_lat), ST_MakePoint(ot.fim_lng, ot.fim_lat))::geography
               else ST_MakePoint(ot.inicio_lng, ot.inicio_lat)::geography end))) as dist
      from licencas o
      join licenca_trechos ot on ot.licenca_id = o.id
      left join empresas e on e.id = o.executora_id
      cross join alvo_geo ag
     where o.id <> p_id
       and o.situacao not in ('cancelada', 'indeferida')
       and ST_DWithin(ag.g,
             case when ot.fim_lat is not null and ot.fim_lng is not null
               then ST_MakeLine(ST_MakePoint(ot.inicio_lng, ot.inicio_lat), ST_MakePoint(ot.fim_lng, ot.fim_lat))::geography
               else ST_MakePoint(ot.inicio_lng, ot.inicio_lat)::geography end, 15)
     group by o.id, o.numero, o.processo_sei, o.situacao, o.concluida_em, o.recomposicao_data,
              o.inicio_previsto, o.fim_previsto, executora, ot.logradouro
  )
  select distinct on (c.id)
    case when c.concluida_em is not null and c.recomposicao_data is not null then 'recomposicao' else 'vigente' end as tipo,
    c.id, c.numero, c.processo_sei, c.executora, c.dist::int as distancia_m, c.logradouro,
    case when c.concluida_em is not null and c.recomposicao_data is not null
           then (c.recomposicao_data + interval '24 months')::date
         else c.fim_previsto end as ate
  from cand c
  where
    -- (a) recém-recomposta, ainda na garantia
    (c.concluida_em is not null and c.recomposicao_data is not null
       and (select d from hoje) <= c.recomposicao_data + interval '24 months')
    or
    -- (b) vigente (deferida, não concluída), com janela de cronograma sobreposta à do alvo
    (c.situacao = 'deferida' and c.concluida_em is null
       and c.inicio_previsto is not null and c.fim_previsto is not null
       and (select inicio_previsto from alvo) is not null and (select fim_previsto from alvo) is not null
       and c.inicio_previsto <= (select fim_previsto from alvo)
       and c.fim_previsto >= (select inicio_previsto from alvo))
  order by c.id, c.dist;
$$;

revoke execute on function public.conflitos_de_licenca(uuid) from public, anon;
grant  execute on function public.conflitos_de_licenca(uuid) to authenticated;
