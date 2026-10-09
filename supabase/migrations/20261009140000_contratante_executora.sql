-- =====================================================================
-- CADEX — a contratante segue o tipo da executora, em todos os setores
--
-- Regra de negócio: quem executa a obra ou é a própria titular (operadora,
-- concessionária, construtora) — e aí NÃO há contratante, ela executa a
-- própria obra — ou é uma terceirizada contratada por alguém — e aí a
-- contratante é obrigatória (empresa titular ou órgão público).
--
-- Até aqui essa obrigatoriedade valia só para telecom sob a Resolução, e
-- nada impedia uma titular de aparecer com contratante. Este aditivo:
--   1. exige a contratante de QUALQUER executora terceirizada (menos no
--      registro histórico anterior à Resolução, que é leniente);
--   2. recusa contratante quando a executora é titular (fora da drenagem,
--      onde a construtora executa para o dono do imóvel, e do histórico).
--
-- Só recria o gatilho licencas_antes_de_gravar (cópia da versão vigente
-- de 20261008130000 com os dois ajustes). As datas de cronograma seguem
-- tratadas no formulário.
-- =====================================================================

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

  -- Contratante: empresa cadastrada OU órgão público OU texto livre. Só uma.
  if (new.contratante_id is not null)::int
     + (new.orgao_contratante_id is not null)::int
     + (new.contratante_razao_social is not null)::int > 1 then
    raise exception 'Informe só uma contratante: empresa cadastrada, órgão público, ou (nos casos permitidos) o nome por extenso.';
  end if;

  -- A titular (operadora, concessionária, construtora) executa a própria
  -- obra: não tem contratante. A exceção é a drenagem, onde a construtora
  -- executa para o dono do imóvel, e o registro histórico anterior.
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
    -- Órgão público: valida o setor só quando o órgão restringe setores.
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
