-- =====================================================================
-- CADEX — licenças de obra de infraestrutura (arts. 10 a 14 e 26)
--
-- O pedido tramita e é decidido no SEI; o CADEX registra o resultado
-- para consulta e fiscalização: processo, número da licença, trechos,
-- cronograma, empresas envolvidas e conclusão da obra.
--
--   processo SEI   NIT-050120/000000/2026: setor, número do SEI, ano
--   nº da licença  numeração própria da SECONSER, digitada no deferimento
--   trechos        um ou mais por licença (art. 11: "por trecho ou
--                  projeto"), com coordenadas de início e fim (art. 2º, VII)
--
-- Deferir exige executora e subcontratada APTAS (arts. 4º e 8º, § 2º).
-- A situação das empresas no deferimento fica congelada na licença.
-- Manutenção rotineira (art. 15) não entra aqui: não tem licença.
--
-- Quem analisa e decide as licenças ainda será definido; por ora só o
-- gestor grava e o CISP consulta (ver docs/DECISOES.md).
-- =====================================================================

create table public.licencas (
  id                     uuid primary key default extensions.gen_random_uuid(),
  processo_sei           text not null unique
                           check (processo_sei ~ '^NIT-[0-9]{6}/[0-9]{6}/[0-9]{4}$'),
  numero                 text unique check (btrim(numero) <> ''),
  -- Art. 10: vala, escavação, furo não destrutivo, poste, rede.
  tipos_obra             text[] not null
                           check (cardinality(tipos_obra) > 0
                                  and tipos_obra <@ array['vala', 'escavacao', 'perfuracao_nao_destrutiva',
                                                          'poste', 'rede']),
  escopo                 text not null check (btrim(escopo) <> ''),
  executora_id           uuid not null references public.empresas(id) on delete restrict,
  contratante_id         uuid references public.empresas(id) on delete restrict,
  subcontratada_id       uuid references public.empresas(id) on delete restrict,
  responsavel_tecnico_id uuid references public.responsaveis_tecnicos(id) on delete set null,
  art_numero             text,                -- ART/RRT específica da obra (art. 12)
  protocolo_data         date not null,
  situacao               text not null default 'em_analise'
                           check (situacao in ('em_analise', 'deferida', 'indeferida', 'cancelada')),
  decisao_data           date,
  inicio_previsto        date,                -- cronograma físico (art. 12)
  fim_previsto           date,                -- validade da licença (art. 13, parágrafo único)
  concluida_em           date,
  as_built_sei           text,                -- nº do documento SEI do As Built (art. 26)
  as_built_data          date,
  observacoes            text,
  empresas_no_deferimento jsonb,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

create index licencas_executora_idx     on public.licencas (executora_id);
create index licencas_contratante_idx   on public.licencas (contratante_id);
create index licencas_subcontratada_idx on public.licencas (subcontratada_id);

create table public.licenca_trechos (
  id          uuid primary key default extensions.gen_random_uuid(),
  licenca_id  uuid not null references public.licencas(id) on delete cascade,
  ordem       int not null default 1,
  logradouro  text not null check (btrim(logradouro) <> ''),
  bairro      text,
  referencia  text,
  -- Faixa larga em volta de Niterói: pega latitude e longitude trocadas
  -- e erros grosseiros, sem pretender ser o limite do município.
  inicio_lat  numeric(9,6) not null check (inicio_lat between -23.10 and -22.75),
  inicio_lng  numeric(9,6) not null check (inicio_lng between -43.25 and -42.85),
  -- Sem fim: intervenção pontual (ex.: implantação de um poste).
  fim_lat     numeric(9,6) check (fim_lat between -23.10 and -22.75),
  fim_lng     numeric(9,6) check (fim_lng between -43.25 and -42.85),
  criado_em   timestamptz not null default now(),
  check ((fim_lat is null) = (fim_lng is null))
);

create index licenca_trechos_licenca_idx on public.licenca_trechos (licenca_id, ordem);

-- ---------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------
create or replace function public.empresa_resumo(p_id uuid)
returns jsonb language sql stable
set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'codigo_cadex', e.codigo_cadex, 'cnpj', e.cnpj, 'razao_social', e.razao_social,
    'situacao', public.situacao_efetiva(e.situacao, e.validade_ate), 'validade_ate', e.validade_ate)
    from public.empresas e where e.id = p_id;
$$;

create or replace function public.licencas_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_tipo_executora text;
begin
  new.processo_sei  := upper(btrim(new.processo_sei));
  new.numero        := nullif(btrim(new.numero), '');
  new.art_numero    := nullif(btrim(new.art_numero), '');
  new.as_built_sei  := nullif(btrim(new.as_built_sei), '');
  new.atualizado_em := now();

  -- Partes (art. 2º, II, III e VIII)
  select tipo into v_tipo_executora from empresas where id = new.executora_id;
  if new.contratante_id is not null then
    if new.contratante_id = new.executora_id then
      raise exception 'A concessionária contratante não pode ser a própria executora.';
    end if;
    if not exists (select 1 from empresas where id = new.contratante_id and tipo = 'operadora') then
      raise exception 'A concessionária contratante precisa estar cadastrada como operadora.';
    end if;
  elsif v_tipo_executora = 'terceirizada' then
    raise exception 'Executora terceirizada: informe a concessionária contratante.';
  end if;

  if new.subcontratada_id is not null then
    if new.subcontratada_id in (new.executora_id, new.contratante_id) then
      raise exception 'A subcontratada precisa ser outra empresa.';
    end if;
    if not exists (select 1 from vinculos where contratante_id = new.executora_id
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
    if new.art_numero is null then raise exception 'Informe a ART/RRT da obra.'; end if;
    if not exists (select 1 from licenca_trechos where licenca_id = new.id) then
      raise exception 'Cadastre ao menos um trecho antes de deferir.';
    end if;

    if tg_op = 'INSERT' or old.situacao <> 'deferida'
       or new.executora_id <> old.executora_id
       or new.subcontratada_id is distinct from old.subcontratada_id then
      -- Arts. 4º e 8º, § 2º: só empresa apta requer licença.
      if (public.empresa_resumo(new.executora_id) ->> 'situacao') not in ('apta', 'em_saneamento') then
        raise exception 'A executora não está APTA no CADEX: a licença não pode ser deferida.';
      end if;
      if new.subcontratada_id is not null
         and (public.empresa_resumo(new.subcontratada_id) ->> 'situacao') not in ('apta', 'em_saneamento') then
        raise exception 'A subcontratada não está APTA no CADEX (art. 3º, § 1º): a licença não pode ser deferida.';
      end if;
      new.empresas_no_deferimento := jsonb_build_object(
        'em', now(),
        'executora', public.empresa_resumo(new.executora_id),
        'contratante', public.empresa_resumo(new.contratante_id),
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
    raise exception 'Informe o nº do documento SEI e a data do As Built.';
  end if;

  return new;
end;
$$;

create trigger licencas_antes_de_gravar
  before insert or update on public.licencas
  for each row execute function public.licencas_antes_de_gravar();

-- Licença deferida não fica sem trecho.
create or replace function public.licenca_trechos_antes_de_apagar()
returns trigger language plpgsql
set search_path = public as $$
begin
  if exists (select 1 from licencas where id = old.licenca_id and situacao = 'deferida')
     and not exists (select 1 from licenca_trechos where licenca_id = old.licenca_id and id <> old.id) then
    raise exception 'A licença deferida precisa de ao menos um trecho.';
  end if;
  return old;
end;
$$;

create trigger licenca_trechos_antes_de_apagar
  before delete on public.licenca_trechos
  for each row execute function public.licenca_trechos_antes_de_apagar();

revoke execute on function public.licencas_antes_de_gravar()        from public, anon, authenticated;
revoke execute on function public.licenca_trechos_antes_de_apagar() from public, anon, authenticated;
-- Chamada pelo gatilho com a permissão de quem grava; lê empresas pela RLS.
revoke execute on function public.empresa_resumo(uuid)              from public, anon;
grant  execute on function public.empresa_resumo(uuid)              to authenticated;

-- ---------------------------------------------------------------------
-- Gravação da licença com seus trechos numa só transação: ou grava
-- tudo, ou nada. Roda com a permissão de quem chama (RLS: só gestor).
--
-- Ordem: dados da licença (ainda sem mudar a situação) → trechos →
-- situação e conclusão. Assim deferir já encontra os trechos gravados.
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
    insert into licencas (processo_sei, numero, tipos_obra, escopo, executora_id, contratante_id,
                          subcontratada_id, responsavel_tecnico_id, art_numero, protocolo_data,
                          situacao, decisao_data, inicio_previsto, fim_previsto, observacoes)
    values (r.processo_sei, r.numero, r.tipos_obra, r.escopo, r.executora_id, r.contratante_id,
            r.subcontratada_id, r.responsavel_tecnico_id, r.art_numero, r.protocolo_data,
            case when v_sit = 'deferida' then 'em_analise' else v_sit end,
            r.decisao_data, r.inicio_previsto, r.fim_previsto, r.observacoes)
    returning id into v_id;
  else
    update licencas set
      processo_sei = r.processo_sei, numero = r.numero, tipos_obra = r.tipos_obra, escopo = r.escopo,
      executora_id = r.executora_id, contratante_id = r.contratante_id, subcontratada_id = r.subcontratada_id,
      responsavel_tecnico_id = r.responsavel_tecnico_id, art_numero = r.art_numero,
      protocolo_data = r.protocolo_data, decisao_data = r.decisao_data,
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

-- ---------------------------------------------------------------------
-- Auditoria: a licença afeta executora, contratante e subcontratada;
-- o trecho, as empresas da licença.
-- ---------------------------------------------------------------------
create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_antes  jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_linha  jsonb := coalesce(v_depois, v_antes);
  v_chave  text;
begin
  if tg_op = 'UPDATE' then
    for v_chave in select jsonb_object_keys(to_jsonb(new)) loop
      if v_antes -> v_chave is not distinct from v_depois -> v_chave or v_chave = 'atualizado_em' then
        v_antes  := v_antes  - v_chave;
        v_depois := v_depois - v_chave;
      end if;
    end loop;
    if v_depois = '{}'::jsonb then
      return null;  -- nada mudou de fato
    end if;
  end if;

  insert into public.auditoria (por, por_nome, tabela, registro_id, empresas, operacao, antes, depois)
  values (
    auth.uid(),
    (select nome from public.servidores where user_id = auth.uid()),
    tg_table_name,
    coalesce(v_linha ->> 'id', v_linha ->> 'user_id')::uuid,
    case tg_table_name
      when 'empresas'   then array[(v_linha ->> 'id')::uuid]
      when 'vinculos'   then array[(v_linha ->> 'contratante_id')::uuid, (v_linha ->> 'contratada_id')::uuid]
      when 'servidores' then '{}'::uuid[]
      when 'licencas'   then array_remove(array[(v_linha ->> 'executora_id')::uuid,
                                                (v_linha ->> 'contratante_id')::uuid,
                                                (v_linha ->> 'subcontratada_id')::uuid], null)
      when 'licenca_trechos' then coalesce(
        (select array_remove(array[l.executora_id, l.contratante_id, l.subcontratada_id], null)
           from public.licencas l where l.id = (v_linha ->> 'licenca_id')::uuid), '{}')
      else array[(v_linha ->> 'empresa_id')::uuid]
    end,
    tg_op, v_antes, v_depois);
  return null;
end;
$$;

revoke execute on function public.registrar_auditoria() from public, anon, authenticated;

create trigger zz_auditoria after insert or update or delete on public.licencas
  for each row execute function public.registrar_auditoria();
create trigger zz_auditoria after insert or update or delete on public.licenca_trechos
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------
-- Acesso: servidor (gestor e CISP) lê; só o gestor grava.
-- ---------------------------------------------------------------------
alter table public.licencas        enable row level security;
alter table public.licenca_trechos enable row level security;
revoke all on public.licencas, public.licenca_trechos from anon;
grant select, insert, update, delete on public.licencas, public.licenca_trechos to authenticated;

create policy licencas_ler on public.licencas for select to authenticated using (public.is_servidor());
create policy licencas_gravar on public.licencas for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

create policy licenca_trechos_ler on public.licenca_trechos for select to authenticated using (public.is_servidor());
create policy licenca_trechos_gravar on public.licenca_trechos for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());
