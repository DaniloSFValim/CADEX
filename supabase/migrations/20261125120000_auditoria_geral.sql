-- =====================================================================
-- CADEX — correções da auditoria geral (novembro de 2026)
--
-- 1. tipos_intervencao: o visitante recebia 401 em toda página pública do
--    mapa. A política de leitura valia para anon e authenticated com a
--    condição (ativo OR is_servidor()), e o visitante não pode executar
--    is_servidor(): o banco recusava a consulta inteira. Os nomes dos
--    tipos de obra não carregavam para o público. Agora há uma política
--    por papel: o visitante lê só os tipos ativos, sem chamar função.
--
-- 2. estatisticas_publicas.empresas_ativas: contava toda empresa ativa
--    (38), enquanto a consulta pública lista só deferidas ou aptas (33).
--    Os dois números apareciam lado a lado e não batiam. Passa a contar o
--    mesmo universo da consulta pública.
--
-- 3. Desempenho de políticas: auth.uid() e is_servidor() avaliados uma
--    vez por consulta, não uma vez por linha (empresa_usuarios.eu_ler e
--    comunicacoes_servico.csp_empresa_inserir). Mesma regra, sem mudança
--    de quem pode o quê.
--
-- 4. salvar_licenca: corrigir o início e a conclusão de uma licença já
--    concluída, no mesmo salvamento, era recusado. A função gravava o
--    início novo com a conclusão antiga ainda na linha; a regra "conclusão
--    não pode ser anterior ao início" disparava sobre um dado que a
--    pessoa já tinha corrigido. Em produção, um usuário recebeu esse erro
--    28 vezes em 9 minutos (10/11/2026). A regra não muda: só a ordem.
--
-- Reversão: recriar a política única tipos_ler para anon e authenticated,
-- a função da versão 20261124120000 e as políticas sem o (select ...).
-- =====================================================================

-- 1. Leitura dos tipos de obra -----------------------------------------
drop policy if exists tipos_ler on public.tipos_intervencao;
drop policy if exists tipos_ler_publico on public.tipos_intervencao;

create policy tipos_ler_publico on public.tipos_intervencao
  for select to anon using (ativo);

create policy tipos_ler on public.tipos_intervencao
  for select to authenticated using (ativo or (select public.is_servidor()));

-- 2. Números públicos: mesmo universo da consulta de empresas ----------
create or replace function public.estatisticas_publicas()
returns jsonb language sql stable security definer
set search_path = public, extensions as $$
  with obras as (
    select o from jsonb_array_elements(public.obras_publicas()) as o
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'autorizadas_12m', (select count(*) from public.licencas l, hoje
                         where l.situacao = 'deferida' and l.excluida_em is null
                           and public.licenca_do_publico(l)
                           and l.protocolo_data >= hoje.d - 365 and l.protocolo_data <= hoje.d),
    'concluidas_5a', (select count(*) from public.licencas l, hoje
                       where l.situacao = 'deferida' and l.excluida_em is null
                         and public.licenca_do_publico(l)
                         and l.concluida_em >= hoje.d - interval '5 years' and l.concluida_em <= hoje.d),
    'executoras', (select count(distinct o->>'executora') from obras where coalesce(o->>'executora', '') <> ''),
    -- Empresas que a consulta pública lista: ativas, deferidas ou aptas, sem a de teste.
    'empresas_ativas', (select count(*) from public.empresas e
                         where e.ativa and not e.teste
                           and public.situacao_efetiva(e.situacao, e.validade_ate) in ('deferida', 'apta'))
  );
$$;

revoke execute on function public.estatisticas_publicas() from public;
grant execute on function public.estatisticas_publicas() to anon, authenticated;

-- 3. Políticas avaliadas uma vez por consulta ---------------------------
alter policy eu_ler on public.empresa_usuarios
  using ((select public.is_servidor()) or user_id = (select auth.uid()));

alter policy csp_empresa_inserir on public.comunicacoes_servico
  with check (empresa_id = (select public.empresa_do_usuario()) and registrado_por = (select auth.uid()));

-- 4. Corrigir início e conclusão juntos -------------------------------
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
  v_conclui_junto boolean := false;
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
