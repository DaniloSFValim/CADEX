-- =====================================================================
-- CADEX — concorrência na edição de licenças.
--
-- Duas pessoas podiam abrir a mesma licença e salvar: a última gravação
-- sobrescrevia a outra sem aviso. Agora a tela envia a data de alteração
-- que carregou (atualizado_em_esperado). Se a licença mudou desde então,
-- a gravação é recusada com uma mensagem para recarregar. Sem o campo,
-- o comportamento é o de antes (compatível com quem ainda não envia).
--
-- Reversão: recriar salvar_licenca sem o bloco "Quem editou a partir de
-- uma versão antiga" (versão de 20261125120000_auditoria_geral.sql).
-- =====================================================================

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
