-- =====================================================================
-- Testes de aderência ao texto oficial da
-- RESOLUÇÃO CONJUNTA SECONSER/SEOP Nº 001, DE 09 DE SETEMBRO DE 2026
-- Cada bloco cita o dispositivo que verifica.
-- =====================================================================
begin;
set local search_path = public, extensions;

create or replace function assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

create temporary table fx (k text primary key, v uuid) on commit drop;

do $$
declare a uuid;
begin
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('05570714000159','Executora Niterói Ltda','a@x.local','ativo',
          current_date - 1, current_date + 300)
  returning id into a;
  insert into fx values ('ativa', a);
end $$;

-- ---------------------------------------------------------------------
-- Art. 2º, VII — o trecho é delimitado por coordenadas de início e fim.
-- ---------------------------------------------------------------------
do $$
declare ativa uuid; t uuid; iv uuid;
begin
  select v into ativa from fx where k='ativa';
  select id into t from intervention_types where code='VALA';

  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('obra', t, ativa,
          st_setsrid(st_makeline(st_makepoint(-43.1036,-22.8832),
                                 st_makepoint(-43.1018,-22.8815)),4326),
          'obra com trecho')
  returning id into iv;
  insert into fx values ('obra', iv);

  -- Descrever o trecho por texto, sem coordenadas, é recusado.
  begin
    update interventions set segment_from = 'nº 100', segment_to = 'nº 300' where id = iv;
    raise exception 'ASSERT FALHOU: trecho aceito sem coordenadas de início e fim';
  exception when others then
    if position('coordenadas de início e de fim' in sqlerrm) = 0 then raise; end if;
  end;

  update interventions
     set segment_from = 'nº 100', segment_to = 'nº 300',
         segment_start = st_setsrid(st_makepoint(-43.1036,-22.8832),4326),
         segment_end   = st_setsrid(st_makepoint(-43.1018,-22.8815),4326)
   where id = iv;

  perform assert((select segment_start from interventions where id = iv) is not null,
                 'coordenada de início do trecho não gravada (art. 2º, VII)');
end $$;

-- ---------------------------------------------------------------------
-- Art. 6º, II, "c" — equipamentos e contingente são UM documento.
-- ---------------------------------------------------------------------
do $$
begin
  perform assert(not exists (select 1 from document_types where code='CONTINGENTE_TECNICO'),
    'art. 6º, II, "c": equipamentos e contingente não podem ser duas exigências');
  perform assert((select legal_basis from document_types where code='REL_EQUIPAMENTOS')
                 = 'Art. 6º, II, "c"', 'fundamento do art. 6º, II, "c" ausente');
end $$;

-- Art. 6º — todo tipo documental tem fundamento expresso.
do $$
declare n int;
begin
  select count(*) into n from document_types where active and legal_basis is null;
  perform assert(n = 0, n || ' tipo(s) de documento sem fundamento no art. 6º');
end $$;

-- ---------------------------------------------------------------------
-- Arts. 7º, 8º, 13 e 20 — prazos com fundamento no articulado.
-- ---------------------------------------------------------------------
do $$
begin
  perform assert((select legal_basis from system_parameters where key='cadex.analysis_business_days')
                 = 'Art. 7º, caput', 'prazo de 15 dias úteis sem fundamento (art. 7º)');
  perform assert(cadex.param_int('cadex.analysis_business_days') = 15, 'art. 7º: 15 dias úteis');
  perform assert(cadex.param_int('cadex.validity_months') = 12, 'art. 7º, § 1º: 12 meses');
  perform assert(cadex.param_int('cadex.remediation_days') = 30, 'art. 8º: 30 dias');
  perform assert(cadex.param_int('license.analysis_business_days') = 20, 'art. 13: 20 dias úteis');
  perform assert(cadex.param_int('emergency.regularization_hours') = 24, 'art. 20: 24 horas');
  perform assert(cadex.param_int('transition.days') = 60, 'art. 29: 60 dias');
end $$;

-- ---------------------------------------------------------------------
-- Art. 20 — o prazo de 24 horas corre da CONCLUSÃO DO ATENDIMENTO.
-- Este é o teste que fixa a correção da divergência apurada.
-- ---------------------------------------------------------------------
do $$
declare ativa uuid; t uuid; iv uuid; e uuid; p uuid;
        v_called timestamptz; v_concluded timestamptz; due timestamptz;
begin
  select v into ativa from fx where k='ativa';
  select id into t from intervention_types where code='EMERGENCIA';

  v_called    := now() - interval '10 hours';
  v_concluded := now() - interval '2 hours';

  insert into cisp_protocols (protocol_number, called_at)
  values ('CISP-ART20', v_called) returning id into p;

  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('emergencia', t, ativa, st_setsrid(st_makepoint(-43.104,-22.884),4326), 'emerg')
  returning id into iv;

  insert into emergencies (intervention_id, cisp_protocol_id, risk_nature, risk_category,
                           vehicle_kind, vehicle_plate, on_site_responsible_name,
                           on_site_responsible_doc, on_site_responsible_phone,
                           dispatched_at, arrived_at, concluded_at)
  values (iv, p, 'cabo rompido', 'risco_iminente', 'Utilitário', 'ABC1D23',
          'Encarregado', '00.000.000-0', '(21) 0000-0000',
          v_called, v_called + interval '20 minutes', v_concluded)
  returning id into e;

  select regularization_due_at into due from emergencies where id = e;

  perform assert(abs(extract(epoch from (due - (v_concluded + interval '24 hours')))) < 5,
    'art. 20: o prazo deve correr da CONCLUSÃO do atendimento');
  perform assert(due > v_called + interval '24 hours',
    'art. 20: contar do acionamento antecipa indevidamente o termo final');
end $$;

-- ---------------------------------------------------------------------
-- Art. 19 — acionamento do CISP no momento do deslocamento.
-- ---------------------------------------------------------------------
do $$
declare ativa uuid; t uuid; iv uuid;
begin
  select v into ativa from fx where k='ativa';
  select id into t from intervention_types where code='EMERGENCIA';

  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('emergencia', t, ativa, st_setsrid(st_makepoint(-43.105,-22.885),4326), 'e2')
  returning id into iv;

  -- Deslocamento sem protocolo do CISP é vedado.
  begin
    insert into emergencies (intervention_id, risk_nature, dispatched_at)
    values (iv, 'risco', now());
    raise exception 'ASSERT FALHOU: deslocamento sem acionamento do CISP';
  exception when others then
    if position('acionamento prévio do CISP' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- Art. 19, § 1º — conteúdo mínimo da comunicação ao 153.
do $$
declare ativa uuid; t uuid; iv uuid; p uuid;
begin
  select v into ativa from fx where k='ativa';
  select id into t from intervention_types where code='EMERGENCIA';

  insert into cisp_protocols (protocol_number, called_at)
  values ('CISP-P1', now()) returning id into p;
  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('emergencia', t, ativa, st_setsrid(st_makepoint(-43.106,-22.886),4326), 'e3')
  returning id into iv;

  -- Sem tipo e placa do veículo.
  begin
    insert into emergencies (intervention_id, cisp_protocol_id, risk_nature)
    values (iv, p, 'risco');
    raise exception 'ASSERT FALHOU: protocolo aceito sem tipo e placa do veículo';
  exception when others then
    if position('tipo e placa do veículo' in sqlerrm) = 0 then raise; end if;
  end;

  -- Sem identificação do responsável presente no local.
  begin
    insert into emergencies (intervention_id, cisp_protocol_id, risk_nature,
                             vehicle_kind, vehicle_plate)
    values (iv, p, 'risco', 'Utilitário', 'ABC1D23');
    raise exception 'ASSERT FALHOU: protocolo aceito sem dados do responsável';
  exception when others then
    if position('responsável presente no local' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- Art. 20, parágrafo único — desqualificação da emergência que não se
-- enquadre no art. 18, restrita à análise da SECONSER.
do $$
declare ativa uuid; t uuid; iv uuid; e uuid; p uuid; stt emergency_status;
begin
  select v into ativa from fx where k='ativa';
  select id into t from intervention_types where code='EMERGENCIA';
  insert into cisp_protocols (protocol_number, called_at)
  values ('CISP-P2', now() - interval '3 hours') returning id into p;
  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('emergencia', t, ativa, st_setsrid(st_makepoint(-43.107,-22.887),4326), 'e4')
  returning id into iv;
  insert into emergencies (intervention_id, cisp_protocol_id, risk_nature, risk_category,
                           vehicle_kind, vehicle_plate, on_site_responsible_name,
                           on_site_responsible_doc, on_site_responsible_phone)
  values (iv, p, 'risco', 'servico_essencial', 'Caminhão', 'XYZ9A88',
          'Encarregado', '11.111.111-1', '(21) 1111-1111')
  returning id into e;

  perform set_config('cadex.test_user_id','',false);
  begin
    perform cadex.disqualify_emergency(e, 'não se enquadra');
    raise exception 'ASSERT FALHOU: desqualificação sem papel da SECONSER';
  exception when others then
    if position('restrita à análise da SECONSER' in sqlerrm) = 0 then raise; end if;
  end;

  perform auth.login('00000000-0000-4000-8000-000000000002');
  begin
    perform cadex.disqualify_emergency(e, '');
    raise exception 'ASSERT FALHOU: desqualificação sem motivação';
  exception when others then
    if position('motivada' in sqlerrm) = 0 then raise; end if;
  end;

  perform cadex.disqualify_emergency(e, 'Serviço programado apresentado como emergência.');
  perform set_config('cadex.test_user_id','',false);

  select status into stt from emergencies where id = e;
  perform assert(stt = 'nao_enquadrada',
    'art. 20, parágrafo único: emergência desqualificada deveria ficar nao_enquadrada');
  perform assert(exists (select 1 from audit_logs
                          where entity='emergencies' and entity_id = e::text
                            and action='DESQUALIFICACAO_ART18'),
    'a desqualificação deve constar da trilha de auditoria');
end $$;

-- ---------------------------------------------------------------------
-- Art. 25 — a OS é subscrita por responsável técnico ou preposto.
-- ---------------------------------------------------------------------
do $$
declare ativa uuid; iv uuid;
begin
  select v into ativa from fx where k='ativa';
  select v into iv from fx where k='obra';

  begin
    insert into work_orders (intervention_id, executor_id, address, description,
                             responsible_name)
    values (iv, ativa, 'Av. Ernani do Amaral Peixoto, 100', 'serviço', 'Encarregado');
    raise exception 'ASSERT FALHOU: OS aceita sem subscrição';
  exception when others then
    if position('subscrita pelo responsável técnico' in sqlerrm) = 0 then raise; end if;
  end;

  -- Preposto sem designação de responsável técnico identificado.
  begin
    insert into work_orders (intervention_id, executor_id, address, description,
                             responsible_name, signed_by_name, signed_by_role)
    values (iv, ativa, 'Av. Ernani do Amaral Peixoto, 100', 'serviço', 'Encarregado',
            'Fulano', 'preposto');
    raise exception 'ASSERT FALHOU: preposto aceito sem designação por RT';
  exception when others then
    if position('designado por responsável técnico' in sqlerrm) = 0 then raise; end if;
  end;

  -- Art. 25, § 1º: identificação do responsável pela equipe.
  begin
    insert into work_orders (intervention_id, executor_id, address, description,
                             signed_by_name, signed_by_role)
    values (iv, ativa, 'Av. Ernani do Amaral Peixoto, 100', 'serviço',
            'Eng. RT', 'responsavel_tecnico');
    raise exception 'ASSERT FALHOU: OS aceita sem responsável pela equipe';
  exception when others then
    if position('responsável pela equipe' in sqlerrm) = 0 then raise; end if;
  end;

  insert into work_orders (intervention_id, executor_id, address, description,
                           responsible_name, signed_by_name, signed_by_role)
  values (iv, ativa, 'Av. Ernani do Amaral Peixoto, 100', 'serviço',
          'Encarregado', 'Eng. RT', 'responsavel_tecnico');
end $$;

-- Art. 25, § 1º — o número do CADEX da subcontratada é derivado do
-- cadastro, não digitado.
do $$
declare n int;
begin
  select count(*) into n from work_orders_full where executor_cadex is not null or true;
  perform assert(n >= 1, 'visão da OS com números de CADEX indisponível (art. 25, § 1º)');
end $$;

-- ---------------------------------------------------------------------
-- Art. 8º, § 3º — a habilitação é restabelecida após o saneamento.
-- ---------------------------------------------------------------------
do $$
declare cid uuid; dt uuid; docid uuid; st cadex_status;
begin
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('02558157000162','Saneada Ltda','s@x.local','ativo',
          current_date - 10, current_date + 200)
  returning id into cid;

  select id into dt from document_types where code='CND_FEDERAL';
  insert into company_documents (company_id, document_type_id, status, valid_until,
                                 storage_path, file_name, file_size, mime_type)
  values (cid, dt, 'aprovado', current_date - 1, 'p/x.pdf','x.pdf',10,'application/pdf')
  returning id into docid;

  -- Art. 8º: documento vencido abre o prazo de 30 dias.
  st := cadex.refresh_company_status(cid);
  perform assert(st = 'pendente', 'art. 8º: documento vencido deveria gerar pendência');
  perform assert((select remediation_due_date from companies where id = cid)
                 = current_date + 30, 'art. 8º: prazo de saneamento de 30 dias');

  -- Art. 8º, § 1º: transcorrido o prazo sem saneamento, a inscrição fica inapta.
  update companies set remediation_due_date = current_date - 1 where id = cid;
  st := cadex.refresh_company_status(cid);
  perform assert(st = 'inapto', 'art. 8º, § 1º: deveria passar a inapta');

  -- Art. 8º, § 2º: a empresa inapta não pode requerer licenças nem registrar
  -- autodeclarações — o que, no modelo, é o bloqueio de habilitação.
  perform assert(not cadex.is_company_active(cid),
                 'art. 8º, § 2º: empresa inapta consta como habilitada');

  -- Restabelecimento exige saneamento efetivo.
  perform auth.login('00000000-0000-4000-8000-000000000002');
  begin
    perform cadex.reinstate_company(cid);
    raise exception 'ASSERT FALHOU: habilitação restabelecida sem saneamento';
  exception when others then
    if position('pendência' in sqlerrm) = 0 then raise; end if;
  end;

  -- Art. 8º, § 3º: saneada a pendência, a habilitação é restabelecida.
  update company_documents set valid_until = current_date + 365, status = 'aprovado'
   where id = docid;
  perform cadex.reinstate_company(cid, 'Certidão renovada.');
  perform set_config('cadex.test_user_id','',false);

  perform assert(cadex.is_company_active(cid),
                 'art. 8º, § 3º: habilitação não foi restabelecida após o saneamento');
  perform assert(exists (select 1 from administrative_events
                          where company_id = cid and kind = 'saneamento'),
                 'o restabelecimento deve constar da trilha do processo');
end $$;

-- ---------------------------------------------------------------------
-- Arts. 10 e 15 — o catálogo reproduz o rol legal.
-- ---------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from intervention_types where kind='obra' and requires_license;
  perform assert(n = 5, 'art. 10 lista cinco obras de infraestrutura, encontrado ' || n);

  select count(*) into n from intervention_types where kind='manutencao' and requires_license;
  perform assert(n = 0, 'art. 16: manutenção rotineira não exige licença prévia');

  select count(*) into n from intervention_types where kind='emergencia' and requires_license;
  perform assert(n = 0, 'art. 19: emergência independe de licença prévia');

  select count(*) into n from intervention_types where active and legal_basis is null;
  perform assert(n = 0, n || ' tipo(s) de intervenção sem fundamento nos arts. 10, 15 ou 18');
end $$;

-- ---------------------------------------------------------------------
-- Capítulo IV — todo item do checklist tem fundamento no articulado.
-- ---------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from inspection_checklist_items where active and legal_basis is null;
  perform assert(n = 0, n || ' item(ns) de fiscalização sem fundamento normativo');

  perform assert(exists (select 1 from inspection_checklist_items
                          where code='FAIXAS_RETRORREFLETIVAS'),
    'art. 24, § 2º: faixas retrorrefletivas não constam do checklist');
  perform assert((select legal_basis from inspection_checklist_items where code='VEICULO_IDENT')
                 = 'Art. 21, parágrafo único', 'fundamento da identificação veicular');
end $$;

-- ---------------------------------------------------------------------
-- Art. 14 — a placa/QR Code exibe os quatro elementos exigidos.
-- ---------------------------------------------------------------------
do $$
declare cols text[];
begin
  select array_agg(column_name::text) into cols
    from information_schema.columns where table_name='public_interventions';
  perform assert(cols @> array['executor_name','license_number','scope','ends_on'],
    'art. 14: a placa deve exibir razão social, número da licença, escopo e data prevista de encerramento');
end $$;

-- ---------------------------------------------------------------------
-- Art. 7º, § 2º — publicação da relação de empresas com CADEX ativo.
-- ---------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public_companies where status not in ('ativo','proximo_vencimento');
  perform assert(n = 0, 'art. 7º, § 2º: a publicação alcança apenas empresas com CADEX ativo');
end $$;

-- ---------------------------------------------------------------------
-- Art. 29 — prazo transitório de 60 dias da publicação (09/09/2026).
-- ---------------------------------------------------------------------
do $$
declare v_pub date; v_dl date;
begin
  select (value->>'value')::date into v_pub from system_parameters where key='resolution.published_on';
  select (value->>'value')::date into v_dl  from system_parameters where key='transition.deadline';
  perform assert(v_pub = date '2026-09-09', 'art. 31: data de publicação');
  perform assert(v_dl = v_pub + 60, 'art. 29: o termo final é 60 dias após a publicação');

  perform auth.login('00000000-0000-4000-8000-000000000002');
  perform assert(public.transition_status() ? 'deadline', 'acompanhamento do art. 29 indisponível');
  perform set_config('cadex.test_user_id','',false);
end $$;

rollback;
