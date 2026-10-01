-- =====================================================================
-- CADEX — licenças anteriores à Resolução e processo em texto livre
--
-- A SECONSER vai lançar as licenças emitidas nos últimos 5 anos. Elas
-- são anteriores à Resolução Conjunta nº 001/2026 (09/09/2026): as
-- empresas não tinham inscrição no CADEX, algumas nem existem mais, e
-- os processos seguiam outra numeração. Por isso:
--
--   1. O nº do processo vira texto livre (SEI ou numeração anterior).
--      A coluna mantém o nome processo_sei.
--   2. Licença com decisão anterior a 09/09/2026 é "anterior à
--      Resolução" (calculado pela data, não marcado à mão: ninguém
--      escapa das regras novas trocando um campo):
--        - não exige executora nem subcontratada APTAS;
--        - executora e contratante podem ser só razão social e CNPJ,
--          sem entrar no cadastro nem na consulta pública;
--        - não exige contratante para executora terceirizada, vínculo
--          com a subcontratada nem ART.
--      Continuam exigidos: número da licença, cronograma, trechos com
--      coordenadas e a data da decisão.
--   3. As licenças novas seguem todas as regras de antes.
-- =====================================================================

-- Data de publicação da Resolução: única fonte da regra.
create or replace function public.licenca_anterior_resolucao(p_decisao date)
returns boolean language sql immutable as $$
  select p_decisao < date '2026-09-09';
$$;

-- 1. Processo em texto livre
alter table public.licencas drop constraint licencas_processo_sei_check;
alter table public.licencas add constraint licencas_processo_check check (btrim(processo_sei) <> '');

-- 2. Executora e contratante sem cadastro (só nas anteriores à Resolução)
alter table public.licencas alter column executora_id drop not null;
alter table public.licencas
  add column executora_razao_social   text check (btrim(executora_razao_social) <> ''),
  add column executora_cnpj           text check (executora_cnpj is null or (executora_cnpj ~ '^\d{14}$' and public.cnpj_valido(executora_cnpj))),
  add column contratante_razao_social text check (btrim(contratante_razao_social) <> ''),
  add column contratante_cnpj         text check (contratante_cnpj is null or (contratante_cnpj ~ '^\d{14}$' and public.cnpj_valido(contratante_cnpj))),
  add column anterior_resolucao       boolean generated always as (public.licenca_anterior_resolucao(decisao_data)) stored,
  -- Executora: cadastrada ou digitada, nunca as duas nem nenhuma.
  add constraint licencas_executora_check check (
    (executora_id is not null and executora_razao_social is null and executora_cnpj is null)
    or (executora_id is null and executora_razao_social is not null)),
  add constraint licencas_contratante_check check (
    contratante_id is null or (contratante_razao_social is null and contratante_cnpj is null)),
  add constraint licencas_cnpj_sem_nome_check check (
    (executora_cnpj is null or executora_razao_social is not null)
    and (contratante_cnpj is null or contratante_razao_social is not null));

create or replace function public.licencas_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_tipo_executora text;
  v_anterior boolean := coalesce(public.licenca_anterior_resolucao(new.decisao_data), false);
begin
  new.processo_sei  := regexp_replace(upper(btrim(new.processo_sei)), '\s+', ' ', 'g');
  new.numero        := nullif(btrim(new.numero), '');
  new.art_numero    := nullif(btrim(new.art_numero), '');
  new.as_built_sei  := nullif(btrim(new.as_built_sei), '');
  new.executora_razao_social   := nullif(btrim(new.executora_razao_social), '');
  new.contratante_razao_social := nullif(btrim(new.contratante_razao_social), '');
  new.executora_cnpj   := nullif(regexp_replace(coalesce(new.executora_cnpj, ''), '\D', '', 'g'), '');
  new.contratante_cnpj := nullif(regexp_replace(coalesce(new.contratante_cnpj, ''), '\D', '', 'g'), '');
  new.atualizado_em := now();

  -- Empresa sem cadastro só em licença anterior à Resolução.
  if not v_anterior
     and (new.executora_razao_social is not null or new.contratante_razao_social is not null) then
    raise exception 'Empresa sem cadastro no CADEX só é aceita em licença com decisão anterior a 09/09/2026. Cadastre a empresa ou corrija a data da decisão.';
  end if;

  -- Partes (art. 2º, II, III e VIII)
  select tipo into v_tipo_executora from empresas where id = new.executora_id;
  if new.contratante_id is not null then
    if new.contratante_id = new.executora_id then
      raise exception 'A concessionária contratante não pode ser a própria executora.';
    end if;
    if not exists (select 1 from empresas where id = new.contratante_id and tipo = 'operadora') then
      raise exception 'A concessionária contratante precisa estar cadastrada como operadora.';
    end if;
  elsif v_tipo_executora = 'terceirizada' and new.contratante_razao_social is null and not v_anterior then
    raise exception 'Executora terceirizada: informe a concessionária contratante.';
  end if;

  if new.subcontratada_id is not null then
    if new.subcontratada_id in (new.executora_id, new.contratante_id) then
      raise exception 'A subcontratada precisa ser outra empresa.';
    end if;
    if not v_anterior and not exists (
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
    if new.art_numero is null and not v_anterior then raise exception 'Informe a ART/RRT da obra.'; end if;
    if not exists (select 1 from licenca_trechos where licenca_id = new.id) then
      raise exception 'Cadastre ao menos um trecho antes de deferir.';
    end if;

    if tg_op = 'INSERT' or old.situacao <> 'deferida'
       or new.executora_id is distinct from old.executora_id
       or new.subcontratada_id is distinct from old.subcontratada_id
       or new.decisao_data is distinct from old.decisao_data then
      -- Arts. 4º e 8º, § 2º: só empresa apta requer licença (regra da Resolução).
      if not v_anterior then
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
        'executora', coalesce(public.empresa_resumo(new.executora_id),
                              jsonb_build_object('razao_social', new.executora_razao_social, 'cnpj', new.executora_cnpj)),
        'contratante', coalesce(public.empresa_resumo(new.contratante_id),
                                case when new.contratante_razao_social is not null then
                                  jsonb_build_object('razao_social', new.contratante_razao_social, 'cnpj', new.contratante_cnpj) end),
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

-- A gravação passa a levar os campos de empresa sem cadastro.
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
    insert into licencas (processo_sei, numero, tipos_obra, escopo, executora_id, executora_razao_social,
                          executora_cnpj, contratante_id, contratante_razao_social, contratante_cnpj,
                          subcontratada_id, responsavel_tecnico_id, art_numero, protocolo_data,
                          situacao, decisao_data, inicio_previsto, fim_previsto, observacoes)
    values (r.processo_sei, r.numero, r.tipos_obra, r.escopo, r.executora_id, r.executora_razao_social,
            r.executora_cnpj, r.contratante_id, r.contratante_razao_social, r.contratante_cnpj,
            r.subcontratada_id, r.responsavel_tecnico_id, r.art_numero, r.protocolo_data,
            case when v_sit = 'deferida' then 'em_analise' else v_sit end,
            r.decisao_data, r.inicio_previsto, r.fim_previsto, r.observacoes)
    returning id into v_id;
  else
    update licencas set
      processo_sei = r.processo_sei, numero = r.numero, tipos_obra = r.tipos_obra, escopo = r.escopo,
      executora_id = r.executora_id, executora_razao_social = r.executora_razao_social,
      executora_cnpj = r.executora_cnpj, contratante_id = r.contratante_id,
      contratante_razao_social = r.contratante_razao_social, contratante_cnpj = r.contratante_cnpj,
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

-- Página pública: executora e contratante sem cadastro aparecem pelo nome.
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
    'anterior_resolucao', l.anterior_resolucao,
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
      when l.contratante_razao_social is not null then jsonb_build_object(
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
