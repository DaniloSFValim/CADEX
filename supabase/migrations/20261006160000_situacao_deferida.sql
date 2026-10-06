-- =====================================================================
-- CADEX — situação DEFERIDA e fim de INDEFERIDA
--
-- Entre EM ANÁLISE e APTA entra DEFERIDA: a SECONSER deferiu o
-- requerimento (documentos obrigatórios completos) e a empresa já está
-- HABILITADA a atuar, mas a portaria ainda não foi publicada — por isso
-- ainda sem validade. Publicada a portaria, passa a APTA e a validade de
-- 12 meses começa a correr.
--
--   em_analise  →  deferida  →  apta  →  em_saneamento  →  inapta
--                 (habilitada,   (portaria,    (art. 8º)
--                  sem portaria)  validade)
--
-- DEFERIDA e APTA exigem zero pendência documental. INDEFERIDA deixa de
-- existir: um requerimento negado permanece EM ANÁLISE (a negativa é
-- tratada fora do sistema, decisão da SECONSER).
-- =====================================================================

alter table public.empresas drop constraint empresas_situacao_check;
alter table public.empresas add constraint empresas_situacao_check
  check (situacao in ('em_analise', 'deferida', 'apta', 'em_saneamento', 'inapta'));

create or replace function public.empresas_situacao()
returns trigger language plpgsql as $$
declare
  v_falta_doc boolean := false;
begin
  if new.portaria_numero is not null and btrim(new.portaria_numero) = '' then
    new.portaria_numero := null;
  end if;

  -- Validade de 12 meses a partir da publicação da portaria (art. 7º, § 1º).
  if new.portaria_data is not null
     and (tg_op = 'INSERT' or new.portaria_data is distinct from old.portaria_data) then
    new.validade_ate := (new.portaria_data + interval '12 months')::date;
  end if;

  if tg_op = 'UPDATE' and new.situacao = old.situacao then
    return new;
  end if;

  -- Deferir (DEFERIDA ou APTA) só com todos os documentos obrigatórios
  -- entregues — é o ato de decisão do gestor, portanto na transição
  -- (UPDATE). Seeds/migração que já nascem apta não passam por aqui.
  -- (Mesma regra do app: o último registro de cada tipo exigido está entregue.)
  if tg_op = 'UPDATE' and new.situacao in ('deferida', 'apta') then
    v_falta_doc := exists (
      select 1 from public.tipos_documento t
       where t.obrigatorio
         and public.perfil_documental(new.tipo, new.setores) = any(t.perfis)
         and not exists (
           select 1 from public.documentos d
            where d.empresa_id = new.id and d.tipo = t.codigo and d.status = 'entregue'
              and d.enviado_em = (select max(d2.enviado_em) from public.documentos d2
                                   where d2.empresa_id = new.id and d2.tipo = t.codigo)));
    if v_falta_doc then
      raise exception 'Há documentos obrigatórios pendentes: conclua a entrega antes de deferir (DEFERIDA ou APTA).';
    end if;
  end if;

  case new.situacao
    when 'deferida' then
      if tg_op = 'INSERT' or old.situacao <> 'em_analise' then
        raise exception 'Só um requerimento EM ANÁLISE pode ser deferido.';
      end if;

    when 'apta' then
      if new.portaria_numero is null or new.portaria_data is null then
        raise exception 'Para APTA, informe o número e a data de publicação da portaria que deferiu a inscrição.';
      end if;
      -- Restabelecimento após saneamento (art. 8º, § 3º) encerra a notificação.
      new.notificacao_data := null;

    when 'em_saneamento' then
      if tg_op = 'INSERT' or old.situacao not in ('apta', 'em_saneamento') then
        raise exception 'Só uma empresa APTA pode ser notificada para saneamento (art. 8º).';
      end if;
      if new.notificacao_data is null then
        raise exception 'Informe a data da notificação para saneamento (art. 8º).';
      end if;

    when 'inapta' then
      if tg_op = 'INSERT' or old.situacao <> 'em_saneamento' or new.notificacao_data is null then
        raise exception 'A inaptidão exige notificação prévia para saneamento (art. 8º, caput e § 1º).';
      end if;
      if current_date < new.notificacao_data + 30 then
        raise exception 'O prazo de 30 dias para saneamento só termina em % (art. 8º, § 1º).',
          to_char(new.notificacao_data + 30, 'DD/MM/YYYY');
      end if;

    else null;
  end case;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Licença: DEFERIDA também é executora/subcontratada válida (igual à apta).
-- Única mudança: 'deferida' entra na lista de situações aptas a executar.
-- ---------------------------------------------------------------------
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
        if (public.empresa_resumo(new.executora_id) ->> 'situacao') not in ('apta', 'em_saneamento', 'deferida') then
          raise exception 'A executora não está APTA no CADEX: a licença não pode ser deferida.';
        end if;
        if new.subcontratada_id is not null
           and (public.empresa_resumo(new.subcontratada_id) ->> 'situacao') not in ('apta', 'em_saneamento', 'deferida') then
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
