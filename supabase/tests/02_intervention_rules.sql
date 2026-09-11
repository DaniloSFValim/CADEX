-- =====================================================================
-- Testes — intervenções: habilitação, licença, autodeclaração,
-- emergência, prazos e consulta pública (§12–§19, §29, §43, §45)
-- =====================================================================
begin;

create or replace function assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

-- Fixtures: uma empresa ativa e uma inapta.
create temporary table fx (k text primary key, v uuid) on commit drop;

do $$
declare a uuid; i uuid; t uuid;
begin
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('05570714000159','Ativa Ltda','a@x.local','ativo',
          current_date - 1, current_date + 300)
  returning id into a;
  insert into fx values ('ativa', a);

  insert into companies (cnpj, legal_name, email, status)
  values ('07526557000100','Inapta Ltda','i@x.local','inapto')
  returning id into i;
  insert into fx values ('inapta', i);

  select id into t from intervention_types where code = 'VALA';
  insert into fx values ('tipo_vala', t);
end $$;

-- --- §43 Regra 1: sem CADEX ativo, não executa -----------------------
do $$
declare inapta uuid; tipo uuid;
begin
  select v into inapta from fx where k='inapta';
  select v into tipo from fx where k='tipo_vala';
  begin
    insert into interventions (kind, type_id, executor_id, geom, description)
    values ('obra', tipo, inapta,
            st_setsrid(st_makepoint(-43.17,-22.90),4326), 'x');
    raise exception 'ASSERT FALHOU: empresa inapta criou intervenção';
  exception when others then
    if position('sem CADEX ativo' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- --- §43 Regra 6: subcontratada também precisa de CADEX ativo ---------
do $$
declare ativa uuid; inapta uuid; tipo uuid;
begin
  select v into ativa from fx where k='ativa';
  select v into inapta from fx where k='inapta';
  select v into tipo from fx where k='tipo_vala';
  begin
    insert into interventions (kind, type_id, executor_id, subcontractor_id, geom, description)
    values ('obra', tipo, ativa, inapta,
            st_setsrid(st_makepoint(-43.17,-22.90),4326), 'x');
    raise exception 'ASSERT FALHOU: subcontratada inapta foi aceita';
  exception when others then
    if position('subcontratada sem CADEX ativo' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- --- §11: os três papéis são preservados no snapshot -----------------
do $$
declare ativa uuid; tipo uuid; iv uuid; snap jsonb;
begin
  select v into ativa from fx where k='ativa';
  select v into tipo from fx where k='tipo_vala';
  insert into interventions (kind, type_id, concessionaire_id, executor_id, geom, description)
  values ('obra', tipo, ativa, ativa,
          st_setsrid(st_makepoint(-43.17,-22.90),4326), 'obra teste')
  returning id into iv;
  insert into fx values ('obra', iv);

  select snapshot into snap from interventions where id = iv;
  perform assert(snap->'executor'->>'cadex_number' is not null
                 or snap->'executor'->>'id' is not null,
                 'snapshot da executora não foi gravado');
  perform assert(snap ? 'concessionaire', 'snapshot não preservou a concessionária');
end $$;

-- --- §12/§43 Regra 2: obra não inicia sem licença deferida ------------
do $$
declare iv uuid; l uuid;
begin
  select v into iv from fx where k='obra';
  begin
    perform cadex.start_intervention(iv);
    raise exception 'ASSERT FALHOU: obra iniciou sem licença';
  exception when others then
    if position('sem licença deferida' in sqlerrm) = 0 then raise; end if;
  end;

  insert into licenses (intervention_id, status) values (iv, 'rascunho') returning id into l;
  insert into fx values ('licenca', l);

  update licenses set status = 'protocolada' where id = l;
  perform assert((select analysis_due_date from licenses where id = l) is not null,
                 'prazo de análise da licença não foi calculado no protocolo (§31)');
  perform assert((select protocol_number from licenses where id = l) is not null,
                 'número de protocolo da licença não foi gerado');

  update licenses set status = 'em_analise' where id = l;

  -- Deferimento exige papel
  perform set_config('cadex.test_user_id','',false);
  begin
    perform cadex.approve_license(l, current_date + 30);
    raise exception 'ASSERT FALHOU: licença deferida sem papel';
  exception when others then
    if position('Somente Administrador' in sqlerrm) = 0 then raise; end if;
  end;

  perform auth.login('00000000-0000-4000-8000-000000000002');
  perform cadex.approve_license(l, (current_date + 30)::date, 'ok');
  perform set_config('cadex.test_user_id','',false);

  perform assert((select license_number from licenses where id = l) is not null,
                 'número da licença não foi gerado no deferimento (§14)');
  perform cadex.start_intervention(iv);
  perform assert((select started_at from interventions where id = iv) is not null,
                 'início da obra não foi registrado');

  -- Licença vencida impede novo início
  update licenses set status='deferida', valid_until = current_date - 1 where id = l;
  begin
    perform cadex.start_intervention(iv);
    raise exception 'ASSERT FALHOU: obra iniciou com licença vencida';
  exception when others then
    if position('vencida' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- --- §16/§43 Regra 3: registro antes do deslocamento ------------------
do $$
declare ativa uuid; t uuid; iv uuid; d uuid;
begin
  select v into ativa from fx where k='ativa';
  select id into t from intervention_types where code = 'EMENDA';
  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('manutencao', t, ativa, st_setsrid(st_makepoint(-43.18,-22.91),4326),'manut')
  returning id into iv;

  -- Deslocamento sem registro é vedado
  begin
    insert into declarations (intervention_id, status, scheduled_start, dispatched_at)
    values (iv, 'rascunho', now(), now());
    raise exception 'ASSERT FALHOU: deslocamento aceito sem registro prévio';
  exception when others then
    if position('antes do deslocamento' in sqlerrm) = 0 then raise; end if;
  end;

  insert into declarations (intervention_id, status, scheduled_start)
  values (iv, 'registrada', now() + interval '1 hour') returning id into d;

  perform assert((select registered_at from declarations where id = d) is not null,
                 'registro da autodeclaração não foi carimbado');
  perform assert((select declaration_number from declarations where id = d) is not null,
                 'número da autodeclaração não foi gerado');

  -- Deslocamento anterior ao registro é vedado
  begin
    update declarations set dispatched_at = now() - interval '1 day' where id = d;
    raise exception 'ASSERT FALHOU: deslocamento retroativo aceito';
  exception when others then
    if position('anterior ao registro' in sqlerrm) = 0 then raise; end if;
  end;

  update declarations set dispatched_at = now() + interval '30 minutes' where id = d;
end $$;

-- --- §18/§19/§43 Regra 5: emergência, prazo e regularização ----------
do $$
declare ativa uuid; t uuid; iv uuid; e uuid; p uuid; due timestamptz; stt emergency_status;
begin
  select v into ativa from fx where k='ativa';
  select id into t from intervention_types where code = 'EMERGENCIA';

  insert into cisp_protocols (protocol_number, called_at)
  values ('CISP-TEST-1', now() - interval '1 hour') returning id into p;

  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('emergencia', t, ativa, st_setsrid(st_makepoint(-43.175,-22.908),4326),'emerg')
  returning id into iv;

  insert into emergencies (intervention_id, cisp_protocol_id, risk_nature)
  values (iv, p, 'cabo rompido') returning id into e;

  select regularization_due_at into due from emergencies where id = e;
  perform assert(due is not null, 'prazo de regularização não calculado');
  perform assert(due = (now() - interval '1 hour') + interval '24 hours'
                 or abs(extract(epoch from (due - ((now() - interval '1 hour') + interval '24 hours')))) < 5,
                 'prazo de 24h não contado a partir do acionamento (§19)');

  -- Sem escopo/fotos, não regulariza
  begin
    perform cadex.regularize_emergency(e);
    raise exception 'ASSERT FALHOU: regularizou sem descrição do serviço';
  exception when others then
    if position('serviço executado' in sqlerrm) = 0 then raise; end if;
  end;

  update emergencies set executed_service = 'reparo concluído' where id = e;
  begin
    perform cadex.regularize_emergency(e);
    raise exception 'ASSERT FALHOU: regularizou sem fotografia';
  exception when others then
    if position('fotográfico' in sqlerrm) = 0 then raise; end if;
  end;

  insert into emergency_photos (emergency_id, storage_path) values (e, 'p/e1.jpg');
  perform cadex.regularize_emergency(e);
  select status into stt from emergencies where id = e;
  perform assert(stt = 'regularizada', 'deveria ficar regularizada, veio ' || stt);

  -- Fora do prazo é detectado, não silenciado
  update emergencies set regularized_at = null, status = 'em_atendimento',
         regularization_due_at = now() - interval '1 hour' where id = e;
  perform cadex.regularize_emergency(e);
  select status into stt from emergencies where id = e;
  perform assert(stt = 'fora_do_prazo', 'atraso deveria virar fora_do_prazo, veio ' || stt);
end $$;

-- --- §23: OS não emergencial exige endereço --------------------------
do $$
declare ativa uuid; iv uuid;
begin
  select v into ativa from fx where k='ativa';
  select v into iv from fx where k='obra';
  begin
    insert into work_orders (intervention_id, executor_id, description)
    values (iv, ativa, 'sem endereço');
    raise exception 'ASSERT FALHOU: OS de obra aceita sem endereço';
  exception when others then
    if position('exige endereço' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- --- §14/§29: consulta pública por token, sem login -------------------
do $$
declare iv uuid; tok text; r jsonb;
begin
  select v into iv from fx where k='obra';
  update licenses set status='deferida', valid_until = current_date + 30
   where intervention_id = iv;
  select public_token into tok from interventions where id = iv;

  r := public.verify_public_token(tok);
  perform assert(r->>'executor_name' is not null,
                 'consulta pública por QR Code não retornou a intervenção');
  perform assert(not (r ? 'concessionaire_id'),
                 'consulta pública expôs identificador interno');

  perform assert(public.verify_public_token('token-inexistente')->>'found' = 'false',
                 'token inválido deveria retornar found=false');
end $$;

-- --- §36: a view pública não expõe dado pessoal ----------------------
do $$
declare cols text[];
begin
  select array_agg(column_name::text) into cols
    from information_schema.columns
   where table_name = 'public_interventions';
  perform assert(not (cols && array['cpf','email','phone','photo_path',
                                    'on_site_responsible_doc','storage_path']),
                 'view pública contém coluna de dado pessoal');

  select array_agg(column_name::text) into cols
    from information_schema.columns where table_name = 'public_companies';
  perform assert(not (cols && array['email','phone','street','number']),
                 'view pública de empresas contém dado de contato/endereço');
end $$;

-- --- §26/§24: consulta espacial de proximidade -----------------------
do $$
declare n int;
begin
  select count(*) into n from public.interventions_near(-43.17, -22.90, 2000);
  perform assert(n >= 1, 'consulta espacial não encontrou intervenção próxima');
  select count(*) into n from public.interventions_near(0, 0, 100);
  perform assert(n = 0, 'consulta espacial retornou intervenção distante');
end $$;

-- --- §31/§32: varredura de prazos é idempotente ----------------------
do $$
declare r1 jsonb; n1 bigint; n2 bigint;
begin
  r1 := cadex.run_deadline_sweep();
  select count(*) into n1 from notifications;
  perform cadex.run_deadline_sweep();
  select count(*) into n2 from notifications;
  perform assert(n1 = n2, 'varredura duplicou notificações (dedupe falhou)');
end $$;

rollback;
