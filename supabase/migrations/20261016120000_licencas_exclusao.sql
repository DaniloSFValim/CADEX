-- =====================================================================
-- CADEX — exclusão de licenças (obras e serviços lançados por engano)
--
-- Exclusão em duas etapas, só para administrador, com registro de quem,
-- quando e por quê (a auditoria guarda o estado anterior de cada passo):
--   1. "Excluir": a licença vai para a lixeira (excluida_em). Some das
--      listas, do painel, do mapa, da consulta pública e dos conflitos de
--      obra; o administrador a vê na lixeira e pode restaurá-la.
--   2. "Excluir definitivamente": só de quem já está na lixeira. Apaga a
--      licença e seus trechos; o registro na auditoria permanece. Empresas,
--      órgãos e demais cadastros compartilhados não são tocados. As licenças
--      não têm documentos nem arquivos próprios.
--
-- * O nº do processo e o nº da licença só têm de ser únicos entre as
--   licenças fora da lixeira: quem apagou por engano pode lançar de novo o
--   mesmo número. (Índices parciais; as restrições antigas saem no fim.)
-- * Gestor e licenciador deixam de enxergar e de editar o que está na
--   lixeira (políticas), e nenhum deles consegue marcar, restaurar ou apagar
--   por fora das funções: um gatilho exige administrador e a função que chamou.
-- * Registro na lixeira não passa pelas validações de gravação (o que foi
--   lançado errado pode estar incompleto de propósito).
--
-- Reversão: restaurar o que estiver na lixeira, recriar as duas restrições
-- únicas e remover gatilho, funções e colunas.
-- =====================================================================

alter table public.licencas
  add column if not exists excluida_em     timestamptz,
  add column if not exists excluida_por    uuid,
  add column if not exists excluida_motivo text;

create index if not exists licencas_excluida_em_idx on public.licencas (excluida_em) where excluida_em is not null;

create unique index if not exists licencas_processo_sei_ativo on public.licencas (processo_sei) where excluida_em is null;
create unique index if not exists licencas_numero_ativo on public.licencas (numero) where excluida_em is null;

-- ---------------------------------------------------------------------
-- Visibilidade: a lixeira é do administrador.
-- ---------------------------------------------------------------------
alter policy licencas_ler on public.licencas
  using (public.is_servidor() and (excluida_em is null or public.is_administrador()));
alter policy licencas_gravar on public.licencas
  using ((public.is_gestor() or public.is_licenciador()) and excluida_em is null)
  with check ((public.is_gestor() or public.is_licenciador()) and excluida_em is null);

-- ---------------------------------------------------------------------
-- Só as funções abaixo mexem na lixeira: o gatilho confere o administrador
-- e a "senha" da transação posta pela função, para o id certo.
-- ---------------------------------------------------------------------
create or replace function public.licencas_protege_lixeira()
returns trigger language plpgsql
set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.excluida_em is null
       or current_setting('cadex.exclusao_definitiva', true) is distinct from old.id::text
       or not public.is_administrador() then
      raise exception 'Licença só é apagada definitivamente pelo administrador, depois de excluída (lixeira).';
    end if;
    return old;
  end if;
  if (new.excluida_em, new.excluida_por, new.excluida_motivo) is distinct from (old.excluida_em, old.excluida_por, old.excluida_motivo)
     and (current_setting('cadex.exclusao_logica', true) is distinct from old.id::text
          or not public.is_administrador()) then
    raise exception 'Só o administrador exclui ou restaura licenças.';
  end if;
  return new;
end $$;

revoke execute on function public.licencas_protege_lixeira() from public, anon, authenticated;

create or replace trigger licencas_protege_lixeira
  before update or delete on public.licencas
  for each row execute function public.licencas_protege_lixeira();

-- ---------------------------------------------------------------------
-- Funções do administrador.
-- ---------------------------------------------------------------------
create or replace function public.admin_excluir_licenca(p_id uuid, p_motivo text default null)
returns void language plpgsql security definer
set search_path = public as $$
declare l public.licencas;
begin
  if not public.is_administrador() then
    raise exception 'Só o administrador pode excluir licenças.';
  end if;
  select * into l from licencas where id = p_id;
  if not found then raise exception 'Licença não encontrada.'; end if;
  if l.excluida_em is not null then raise exception 'Esta licença já está na lixeira.'; end if;
  perform set_config('cadex.exclusao_logica', p_id::text, true);
  update licencas set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = nullif(btrim(p_motivo), '')
   where id = p_id;
  perform set_config('cadex.exclusao_logica', '', true);
end $$;

create or replace function public.admin_restaurar_licenca(p_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare l public.licencas;
begin
  if not public.is_administrador() then
    raise exception 'Só o administrador pode restaurar licenças.';
  end if;
  select * into l from licencas where id = p_id;
  if not found then raise exception 'Licença não encontrada.'; end if;
  if l.excluida_em is null then raise exception 'Esta licença não está na lixeira.'; end if;
  -- O número não pode ter sido usado de novo por outra licença ativa.
  if exists (select 1 from licencas o where o.id <> p_id and o.excluida_em is null
                and (o.processo_sei = l.processo_sei or (l.numero is not null and o.numero = l.numero))) then
    raise exception 'Não dá para restaurar: outra licença ativa já usa este nº do processo ou da licença. Corrija um dos dois antes.';
  end if;
  perform set_config('cadex.exclusao_logica', p_id::text, true);
  update licencas set excluida_em = null, excluida_por = null, excluida_motivo = null where id = p_id;
  perform set_config('cadex.exclusao_logica', '', true);
end $$;

create or replace function public.admin_excluir_licenca_definitivamente(p_id uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare l public.licencas; v_trechos int;
begin
  if not public.is_administrador() then
    raise exception 'Só o administrador pode apagar licenças definitivamente.';
  end if;
  select * into l from licencas where id = p_id;
  if not found then raise exception 'Licença não encontrada.'; end if;
  if l.excluida_em is null then raise exception 'Exclua a licença antes: ela precisa estar na lixeira.'; end if;
  select count(*) into v_trechos from licenca_trechos where licenca_id = p_id;
  perform set_config('cadex.exclusao_definitiva', p_id::text, true);
  delete from licencas where id = p_id;
  perform set_config('cadex.exclusao_definitiva', '', true);
  return jsonb_build_object('numero', l.numero, 'processo_sei', l.processo_sei, 'trechos_apagados', v_trechos);
end $$;

revoke execute on function public.admin_excluir_licenca(uuid, text) from public, anon;
revoke execute on function public.admin_restaurar_licenca(uuid) from public, anon;
revoke execute on function public.admin_excluir_licenca_definitivamente(uuid) from public, anon;
grant  execute on function public.admin_excluir_licenca(uuid, text) to authenticated;
grant  execute on function public.admin_restaurar_licenca(uuid) to authenticated;
grant  execute on function public.admin_excluir_licenca_definitivamente(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- licencas_antes_de_gravar: registro que entra, está ou sai da lixeira
-- não passa pelas validações (cópia de 20261013120000 com a saída no início).
-- ---------------------------------------------------------------------
create or replace function public.licencas_antes_de_gravar()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_tipo_executora text;
  v_anterior boolean := coalesce(public.licenca_anterior_resolucao(new.decisao_data), false);
  v_resolucao boolean := new.setor = 'telecom' and not coalesce(public.licenca_anterior_resolucao(new.decisao_data), false);
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

  if new.decisao_data < new.protocolo_data then
    raise exception 'A data da decisão não pode ser anterior ao protocolo.';
  end if;
  if new.fim_previsto < new.inicio_previsto then
    raise exception 'O fim da obra ou serviço não pode ser anterior ao início.';
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

-- Consulta pública, dados abertos e conflitos: a lixeira não conta.
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
   where l.situacao in ('deferida', 'cancelada') and l.excluida_em is null;
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
     where l.situacao in ('deferida', 'cancelada') and l.excluida_em is null
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
     and l.situacao in ('deferida', 'cancelada') and l.excluida_em is null;
$$;
revoke execute on function public.licenca_publica(text) from public;
grant  execute on function public.licenca_publica(text) to anon, authenticated;

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
       and o.excluida_em is null
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
-- ---------------------------------------------------------------------
-- As restrições únicas antigas dão lugar aos índices parciais acima.
-- (Este é o único passo destrutivo e não perde dado: só afrouxa a unicidade
-- para quem está fora da lixeira.)
-- ---------------------------------------------------------------------
alter table public.licencas drop constraint licencas_processo_sei_key;
alter table public.licencas drop constraint licencas_numero_key;
