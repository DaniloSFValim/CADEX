-- =====================================================================
-- CADEX — Seed de DEMONSTRAÇÃO (§46)
-- Todos os registros são marcados com demo = true e nomes prefixados
-- por [DEMO]. Nunca aplicar em produção (ver DEPLOY.md).
-- Município: Niterói (art. 1º da Resolução).
-- CNPJs abaixo são fictícios mas com dígitos verificadores VÁLIDOS,
-- porque o banco valida CNPJ de verdade.
-- =====================================================================

-- Extensões vivem em `extensions`, não em `public` (ver migration 00).
set search_path = public, extensions;

do $$
declare
  u_admin uuid := '00000000-0000-4000-8000-000000000001';
  u_gestor uuid := '00000000-0000-4000-8000-000000000002';
  u_fiscal uuid := '00000000-0000-4000-8000-000000000003';
  u_empresa uuid := '00000000-0000-4000-8000-000000000004';
  u_cisp uuid := '00000000-0000-4000-8000-000000000005';

  c_conc uuid := '00000000-0000-4000-9000-000000000001';
  c_exec uuid := '00000000-0000-4000-9000-000000000002';
  c_sub  uuid := '00000000-0000-4000-9000-000000000003';

  q_conc uuid; q_exec uuid; q_sub uuid;
  t_vala uuid; t_emenda uuid; t_emerg uuid;
  i_obra uuid; i_manut uuid; i_emerg uuid;
  l_id uuid; d_id uuid; e_id uuid; p_id uuid;
  team_id uuid; veh_id uuid;
begin
  if exists (select 1 from companies where demo = true) then
    raise notice 'Seed de demonstração já aplicado.';
    return;
  end if;

  -- Usuários -----------------------------------------------------------
  insert into auth.users (id, email) values
    (u_admin,   'admin@demo.cadex.local'),
    (u_gestor,  'gestor@demo.cadex.local'),
    (u_fiscal,  'fiscal@demo.cadex.local'),
    (u_empresa, 'empresa@demo.cadex.local'),
    (u_cisp,    'cisp@demo.cadex.local')
  on conflict do nothing;

  insert into profiles (id, full_name, email, org_unit) values
    (u_admin,   '[DEMO] Administrador',    'admin@demo.cadex.local',   'SECONSER'),
    (u_gestor,  '[DEMO] Gestor SECONSER',  'gestor@demo.cadex.local',  'SECONSER'),
    (u_fiscal,  '[DEMO] Fiscal Viário',    'fiscal@demo.cadex.local',  'SECONSER'),
    (u_empresa, '[DEMO] Preposto Empresa', 'empresa@demo.cadex.local', null),
    (u_cisp,    '[DEMO] Operador CISP',    'cisp@demo.cadex.local',    'SEOP/CISP');

  insert into user_roles (user_id, role) values
    (u_admin,'admin'), (u_gestor,'gestor_seconser'),
    (u_fiscal,'fiscal_viario'), (u_empresa,'empresa'), (u_cisp,'cisp_seop');

  -- Empresas -----------------------------------------------------------
  select id into q_conc from qualifications where code = 'CONCESSIONARIA';
  select id into q_exec from qualifications where code = 'EXECUTORA';
  select id into q_sub  from qualifications where code = 'SUBCONTRATADA';

  insert into companies (id, cnpj, legal_name, trade_name, email, city, state,
                         is_concessionaire, demo, status, cadex_number,
                         valid_from, valid_until)
  values
    (c_conc, '34028316000103', '[DEMO] Concessionária Metropolitana S.A.',
     '[DEMO] ConcessoMetro', 'contato@demo-conc.local', 'Niterói','RJ',
     true, true, 'ativo', 'DEMO-000001', current_date - 30, current_date + 335),
    (c_exec, '33000167000101', '[DEMO] Executora de Redes Ltda.',
     '[DEMO] RedeExec', 'contato@demo-exec.local', 'Niterói','RJ',
     false, true, 'ativo', 'DEMO-000002', current_date - 60, current_date + 305),
    (c_sub,  '60746948000112', '[DEMO] Subcontratada Obras Urbanas Ltda.',
     '[DEMO] SubObras', 'contato@demo-sub.local', 'Niterói','RJ',
     false, true, 'ativo', 'DEMO-000003', current_date - 20, current_date + 345);

  update profiles set company_id = c_exec where id = u_empresa;

  insert into company_qualifications (company_id, qualification_id) values
    (c_conc, q_conc), (c_exec, q_exec), (c_sub, q_sub);

  -- §10 — cadeia: concessionária -> executora -> subcontratada
  insert into company_relationships (parent_id, child_id, relation) values
    (c_conc, c_exec, 'contrato_concessao'),
    (c_exec, c_sub,  'subcontratacao');

  insert into technical_responsibles
    (company_id, full_name, cpf, professional_body, registration_no, registration_uf)
  values (c_exec, '[DEMO] Eng. Responsável', '00000000191', 'CREA', 'RJ-000000/D', 'RJ');

  -- Equipe e veículo ---------------------------------------------------
  insert into teams (company_id, code, name, supervisor_name, valid_until, demo)
  values (c_exec, 'EQ-01', '[DEMO] Equipe Norte', '[DEMO] Supervisor',
          current_date + 180, true)
  returning id into team_id;

  insert into team_members (team_id, full_name, document_number, role_title, valid_until)
  values (team_id, '[DEMO] Técnico de Campo', '00000000191', 'Técnico', current_date + 180);

  insert into vehicles (company_id, concessionaire_id, kind, plate, identification,
                        valid_until, demo)
  values (c_exec, c_conc, 'Utilitário', 'ABC1D23', 'VTR-001', current_date + 180, true)
  returning id into veh_id;

  -- §12 — Obra com licença deferida ------------------------------------
  select id into t_vala from intervention_types where code = 'VALA';

  insert into interventions (kind, type_id, concessionaire_id, executor_id,
                             subcontractor_id, geom, address, street, district,
                             description, scope, construction_method,
                             starts_on, ends_on, demo)
  values ('obra', t_vala, c_conc, c_exec, c_sub,
          st_setsrid(st_makeline(st_makepoint(-43.1036,-22.8832),
                                 st_makepoint(-43.1018,-22.8815)), 4326),
          '[DEMO] Av. Ernani do Amaral Peixoto, trecho 100–300',
          'Av. Ernani do Amaral Peixoto', 'Centro',
          '[DEMO] Abertura de vala para lançamento de rede',
          'Vala de 200 m', 'Céu aberto',
          current_date, current_date + 45, true)
  returning id into i_obra;

  -- Art. 2º, VII: o trecho é delimitado por coordenadas de início e de fim.
  update interventions
     set segment_from = 'nº 100', segment_to = 'nº 300',
         segment_start = st_setsrid(st_makepoint(-43.1036,-22.8832), 4326),
         segment_end   = st_setsrid(st_makepoint(-43.1018,-22.8815), 4326)
   where id = i_obra;

  insert into licenses (intervention_id, status, purpose)
  values (i_obra, 'rascunho', '[DEMO] Expansão de rede')
  returning id into l_id;

  -- Art. 12: o pedido só pode ser protocolado instruído com planta de
  -- locação, cronograma físico e ART/RRT específica. O seed passa pela
  -- mesma exigência do mundo real, em vez de contorná-la.
  insert into license_documents (license_id, kind, storage_path, file_name, file_size, mime_type)
  values (l_id, 'planta_locacao',    'demo/planta.pdf',     '[DEMO] planta-locacao.pdf',     1024, 'application/pdf'),
         (l_id, 'cronograma_fisico', 'demo/cronograma.pdf', '[DEMO] cronograma-fisico.pdf',  1024, 'application/pdf'),
         (l_id, 'art_rrt',           'demo/art.pdf',        '[DEMO] art-especifica.pdf',     1024, 'application/pdf');

  update licenses set status = 'protocolada' where id = l_id;
  update licenses set status = 'em_analise' where id = l_id;

  perform set_config('cadex.test_user_id', u_gestor::text, false);
  perform cadex.approve_license(l_id, (current_date + 45)::date, '[DEMO] Deferida no seed');
  perform set_config('cadex.test_user_id', '', false);

  -- §16 — Manutenção rotineira com roteiro -----------------------------
  select id into t_emenda from intervention_types where code = 'EMENDA';

  insert into interventions (kind, type_id, concessionaire_id, executor_id, geom,
                             address, street, district, description, starts_on, demo)
  values ('manutencao', t_emenda, c_conc, c_exec,
          st_setsrid(st_makepoint(-43.1052,-22.8847), 4326),
          '[DEMO] Rua Visconde do Rio Branco, 50', 'Rua Visconde do Rio Branco', 'Centro',
          '[DEMO] Emenda de fios em rede aérea', current_date, true)
  returning id into i_manut;

  insert into declarations (intervention_id, status, scheduled_start, scheduled_end)
  values (i_manut, 'registrada', now() + interval '2 hours', now() + interval '6 hours')
  returning id into d_id;

  insert into declaration_routes (declaration_id, sequence, geom, address, scheduled_at)
  values
    (d_id, 1, st_setsrid(st_makepoint(-43.1052,-22.8847),4326),
     '[DEMO] Rua Visconde do Rio Branco, 50', now() + interval '2 hours'),
    (d_id, 2, st_setsrid(st_makepoint(-43.1068,-22.8861),4326),
     '[DEMO] Rua Coronel Gomes Machado, 120', now() + interval '4 hours');

  -- §18 — Emergência ---------------------------------------------------
  select id into t_emerg from intervention_types where code = 'EMERGENCIA';

  insert into cisp_protocols (protocol_number, called_at, caller_name)
  values ('[DEMO] CISP-2026-000001', now() - interval '3 hours', '[DEMO] Munícipe')
  returning id into p_id;

  insert into interventions (kind, type_id, concessionaire_id, executor_id, geom,
                             address, street, district, description, demo)
  values ('emergencia', t_emerg, c_conc, c_exec,
          st_setsrid(st_makepoint(-43.1041,-22.8840), 4326),
          '[DEMO] Rua Marquês de Caxias, 10', 'Rua Marquês de Caxias', 'Centro',
          '[DEMO] Cabo rompido com risco à circulação', true)
  returning id into i_emerg;

  -- Art. 19, § 1º: a comunicação ao 153 informa CADEX, endereço, natureza do
  -- risco, tipo e placa do veículo e nome, identidade e telefone do responsável.
  insert into emergencies (intervention_id, cisp_protocol_id, status, risk_nature,
                           risk_category, vehicle_kind, vehicle_plate,
                           dispatched_at, arrived_at,
                           on_site_responsible_name, on_site_responsible_doc,
                           on_site_responsible_phone)
  values (i_emerg, p_id, 'em_atendimento', '[DEMO] Risco de queda de cabo',
          'risco_iminente', 'Utilitário', 'ABC1D23',
          now() - interval '2 hours', now() - interval '90 minutes',
          '[DEMO] Encarregado', '[DEMO] 00.000.000-0', '[DEMO] (21) 0000-0000');

  -- Ordem de serviço e vínculos ----------------------------------------
  -- Art. 25: OS subscrita por responsável técnico ou preposto designado,
  -- com identificação do responsável pela equipe (§ 1º).
  insert into work_orders (intervention_id, executor_id, subcontractor_id,
                           concessionaire_id, team_id, vehicle_id, address,
                           description, responsible_name,
                           signed_by_name, signed_by_role, demo)
  values (i_obra, c_exec, c_sub, c_conc, team_id, veh_id,
          '[DEMO] Av. Ernani do Amaral Peixoto, trecho 100–300',
          '[DEMO] Execução de vala conforme licença',
          '[DEMO] Encarregado de Equipe',
          '[DEMO] Eng. Responsável', 'responsavel_tecnico', true);

  insert into intervention_assignments (intervention_id, team_id, vehicle_id)
  values (i_obra, team_id, veh_id);

  -- Fiscalização -------------------------------------------------------
  insert into inspections (intervention_id, company_id, inspector_id, location,
                           address, findings, demo)
  values (i_obra, c_exec, u_fiscal,
          st_setsrid(st_makepoint(-43.1030,-22.8826),4326)::geography,
          '[DEMO] Av. Ernani do Amaral Peixoto, 200', '[DEMO] Vistoria de rotina', true);

  raise notice 'Seed de demonstração aplicado.';
end $$;
