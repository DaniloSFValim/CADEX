-- =====================================================================
-- Testes — decisões administrativas do art. 30.
-- Travam o comportamento decidido para que não haja deriva silenciosa
-- numa alteração futura.
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
-- Decisão 1 — o prazo de análise não se suspende durante a diligência.
-- ---------------------------------------------------------------------
do $$
declare cid uuid; d0 date; d1 date;
begin
  insert into companies (cnpj, legal_name, email, status)
  values ('11222333000181','Em Analise Ltda','ea@x.local','rascunho')
  returning id into cid;

  update companies set status = 'protocolado' where id = cid;
  select analysis_due_date into d0 from companies where id = cid;
  perform assert(d0 is not null, 'prazo do art. 7º não calculado no protocolo');

  -- Abre diligência: o prazo permanece o mesmo.
  update companies set status = 'em_analise' where id = cid;
  update companies set status = 'pendente'   where id = cid;
  select analysis_due_date into d1 from companies where id = cid;
  perform assert(d1 = d0,
    'decisão art. 30 (1): a diligência não suspende o prazo — era ' || d0 || ', virou ' || d1);

  -- Tentativa direta de empurrar o prazo é revertida.
  update companies set analysis_due_date = d0 + 30 where id = cid;
  select analysis_due_date into d1 from companies where id = cid;
  perform assert(d1 = d0, 'decisão art. 30 (1): o prazo foi empurrado indevidamente');

  -- Retomada da análise também não reabre o prazo.
  update companies set status = 'em_analise' where id = cid;
  select analysis_due_date into d1 from companies where id = cid;
  perform assert(d1 = d0, 'decisão art. 30 (1): o prazo foi reaberto na retomada');
end $$;

-- Mesma regra para a licença (art. 13).
do $$
declare ativa uuid; t uuid; iv uuid; l uuid; d0 date; d1 date;
begin
  select v into ativa from fx where k='ativa';
  select id into t from intervention_types where code='VALA';
  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('obra', t, ativa, st_setsrid(st_makepoint(-43.1036,-22.8832),4326),'obra')
  returning id into iv;
  insert into fx values ('obra', iv);

  insert into licenses (intervention_id, status) values (iv,'rascunho') returning id into l;
  insert into fx values ('licenca', l);

  insert into license_documents (license_id, kind, storage_path, file_name, file_size, mime_type)
  values (l,'planta_locacao','t/p.pdf','p.pdf',10,'application/pdf'),
         (l,'cronograma_fisico','t/c.pdf','c.pdf',10,'application/pdf'),
         (l,'art_rrt','t/a.pdf','a.pdf',10,'application/pdf');

  update licenses set status='protocolada' where id = l;
  select analysis_due_date into d0 from licenses where id = l;

  update licenses set status='em_analise'    where id = l;
  update licenses set status='em_diligencia' where id = l;
  select analysis_due_date into d1 from licenses where id = l;
  perform assert(d1 = d0,
    'decisão art. 30 (1): diligência não suspende o prazo do art. 13');
end $$;

-- ---------------------------------------------------------------------
-- Decisão 2 — a inaptidão não suspende obra já licenciada.
-- ---------------------------------------------------------------------
do $$
declare ativa uuid; iv uuid; l uuid; st license_status; n int;
begin
  select v into ativa from fx where k='ativa';
  select v into iv   from fx where k='obra';
  select v into l    from fx where k='licenca';

  perform auth.login('00000000-0000-4000-8000-000000000002');
  perform cadex.approve_license(l, (current_date + 60)::date, 'ok');
  perform set_config('cadex.test_user_id','',false);
  perform cadex.start_intervention(iv);

  -- A executora fica inapta depois do deferimento.
  update companies set status='inapto', valid_until = current_date - 1 where id = ativa;
  perform assert(not cadex.is_company_active(ativa), 'empresa deveria estar inapta');

  -- A licença deferida permanece; a obra em curso não é suspensa.
  select status into st from licenses where id = l;
  perform assert(st = 'em_execucao',
    'decisão art. 30 (2): a obra licenciada não deve ser suspensa, veio ' || st);
  perform assert((select started_at from interventions where id = iv) is not null,
    'decisão art. 30 (2): o início registrado não deve ser desfeito');

  -- Mas não cabe nova vinculação com a empresa inapta (art. 8º, § 2º).
  begin
    insert into interventions (kind, type_id, executor_id, geom, description)
    values ('obra', (select id from intervention_types where code='VALA'), ativa,
            st_setsrid(st_makepoint(-43.10,-22.88),4326), 'nova obra');
    raise exception 'ASSERT FALHOU: empresa inapta foi vinculada a nova intervenção';
  exception when others then
    if position('sem CADEX ativo' in sqlerrm) = 0 then raise; end if;
  end;

  -- Contrapartida de transparência: a situação corrente é publicada.
  select count(*) into n from information_schema.columns
   where table_name='public_interventions'
     and column_name in ('executor_cadex_status','executor_cadex_active');
  perform assert(n = 2,
    'decisão art. 30 (2): a situação cadastral corrente da executora deve ser publicada');
end $$;

-- ---------------------------------------------------------------------
-- Decisão 3 — substituição de poste é manutenção, salvo escavação.
-- ---------------------------------------------------------------------
do $$
declare ativa uuid; t_subst uuid; t_poste uuid; iv uuid; req boolean;
begin
  -- A empresa da fixture ficou inapta no bloco anterior; habilita outra.
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('07526557000100','Outra Executora Ltda','o@x.local','ativo',
          current_date - 1, current_date + 300)
  returning id into ativa;

  select id into t_subst from intervention_types where code='SUBST_POSTE';
  perform assert(t_subst is not null,
    'decisão art. 30 (3): tipo SUBST_POSTE não cadastrado');

  select requires_license into req from intervention_types where id = t_subst;
  perform assert(req = false,
    'decisão art. 30 (3): substituição de poste não exige licença prévia');
  perform assert((select kind from intervention_types where id = t_subst) = 'manutencao',
    'decisão art. 30 (3): substituição de poste é manutenção rotineira');

  -- A implantação de poste continua sendo obra (art. 10).
  select id into t_poste from intervention_types where code='POSTE';
  perform assert((select kind from intervention_types where id = t_poste) = 'obra',
    'art. 10: a implantação de postes permanece obra de infraestrutura');
  perform assert((select requires_license from intervention_types where id = t_poste),
    'art. 11: a implantação de postes exige licença prévia');

  -- Substituição sem escavação: registrada como manutenção.
  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('manutencao', t_subst, ativa,
          st_setsrid(st_makepoint(-43.1052,-22.8847),4326),
          'substituição de poste em cava existente')
  returning id into iv;
  perform assert(iv is not null, 'substituição sem escavação deveria ser aceita');

  -- Substituição com escavação: recai no art. 10 e é recusada como manutenção.
  begin
    insert into interventions (kind, type_id, executor_id, geom, description,
                               requires_excavation)
    values ('manutencao', t_subst, ativa,
            st_setsrid(st_makepoint(-43.1053,-22.8848),4326),
            'substituição com nova cava', true);
    raise exception 'ASSERT FALHOU: escavação aceita como manutenção rotineira';
  exception when others then
    if position('obra de infraestrutura (art. 10)' in sqlerrm) = 0 then raise; end if;
  end;

  -- A mesma atividade, registrada como obra, é aceita e exige licença.
  insert into interventions (kind, type_id, executor_id, geom, description,
                             requires_excavation)
  values ('obra', t_poste, ativa,
          st_setsrid(st_makepoint(-43.1053,-22.8848),4326),
          'implantação de poste com nova fundação', true)
  returning id into iv;
  begin
    perform cadex.start_intervention(iv);
    raise exception 'ASSERT FALHOU: obra iniciou sem licença';
  exception when others then
    if position('sem licença deferida' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- As três decisões estão registradas e são auditáveis.
-- ---------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from normative_decisions_current;
  perform assert(n >= 3, 'as três decisões do art. 30 devem estar registradas, há ' || n);

  select count(*) into n from normative_decisions where legal_basis not like 'Art. 30%';
  perform assert(n = 0, 'toda decisão registrada deve invocar o art. 30');

  select count(*) into n from normative_decisions where coalesce(system_effect,'') = '';
  perform assert(n = 0, 'toda decisão deve declarar seu efeito concreto no sistema');
end $$;

rollback;
