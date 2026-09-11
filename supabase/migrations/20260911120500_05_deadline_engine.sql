-- =====================================================================
-- CADEX — 05: motor de prazos, notificações e catálogos base (§30–§32)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parâmetros normativos (§31)
-- legal_basis = NULL => ainda não conferido contra o texto oficial da
-- Resolução. Os valores abaixo vieram da especificação funcional, não do
-- texto legal; ver COMPLIANCE-MATRIX.md.
-- ---------------------------------------------------------------------
insert into system_parameters (key, value, description, unit, legal_basis) values
  ('cadex.analysis_business_days', '{"value":15}',
   'Prazo de análise do requerimento CADEX', 'dias úteis', null),
  ('cadex.validity_months', '{"value":12}',
   'Validade da inscrição CADEX deferida', 'meses', null),
  ('cadex.remediation_days', '{"value":30}',
   'Prazo de saneamento de pendência documental', 'dias corridos', null),
  ('cadex.warning_days', '{"value":30}',
   'Antecedência do alerta de vencimento do CADEX', 'dias corridos', null),
  ('license.analysis_business_days', '{"value":20}',
   'Prazo de análise do pedido de licença de obra', 'dias úteis', null),
  ('emergency.regularization_hours', '{"value":24}',
   'Prazo para regularização de emergência no sistema', 'horas', null),
  ('transition.days', '{"value":60}',
   'Prazo transitório para empresas já atuantes se cadastrarem', 'dias corridos', null),
  ('document.warning_days', '{"value":30}',
   'Antecedência do alerta de vencimento de documento', 'dias corridos', null)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Prazos administrativos calculados no protocolo
-- ---------------------------------------------------------------------
create or replace function cadex.set_company_analysis_due()
returns trigger language plpgsql as $$
begin
  if new.status = 'protocolado' and old.status is distinct from 'protocolado' then
    new.protocolled_at := coalesce(new.protocolled_at, now());
    new.analysis_due_date := cadex.add_business_days(
      current_date, coalesce(cadex.param_int('cadex.analysis_business_days'), 15));
    new.protocol_number := coalesce(new.protocol_number,
      'CADEX-' || to_char(current_date,'YYYYMMDD') || '-' ||
      lpad((nextval('cadex_number_seq'))::text, 6, '0'));
  end if;
  return new;
end;
$$;

create trigger trg_company_analysis_due
  before update on companies
  for each row execute function cadex.set_company_analysis_due();

create or replace function cadex.set_license_analysis_due()
returns trigger language plpgsql as $$
begin
  if new.status = 'protocolada' and old.status is distinct from 'protocolada' then
    new.protocolled_at := coalesce(new.protocolled_at, now());
    new.analysis_due_date := cadex.add_business_days(
      current_date, coalesce(cadex.param_int('license.analysis_business_days'), 20));
    new.protocol_number := coalesce(new.protocol_number,
      'PL-' || to_char(current_date,'YYYYMMDD') || '-' ||
      lpad((nextval('license_number_seq'))::text, 6, '0'));
  end if;
  return new;
end;
$$;

create trigger trg_license_analysis_due
  before update on licenses
  for each row execute function cadex.set_license_analysis_due();

-- ---------------------------------------------------------------------
-- Emissor de notificações com deduplicação
-- ---------------------------------------------------------------------
create or replace function cadex.notify(
  p_company_id uuid, p_category text, p_severity text,
  p_title text, p_body text, p_entity text, p_entity_id text, p_dedupe text)
returns void language plpgsql security definer set search_path = public, cadex as $$
begin
  insert into notifications (company_id, category, severity, title, body,
                             entity, entity_id, dedupe_key)
  values (p_company_id, p_category, p_severity, p_title, p_body,
          p_entity, p_entity_id, p_dedupe)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- §31/§32 — varredura diária de prazos. Idempotente: pode rodar N vezes.
-- Agendada via pg_cron (ver DEPLOY.md) ou por Edge Function/cron externo.
-- ---------------------------------------------------------------------
create or replace function cadex.run_deadline_sweep()
returns jsonb language plpgsql security definer set search_path = public, cadex as $$
declare
  r record;
  v_doc_warn int := coalesce(cadex.param_int('document.warning_days'), 30);
  v_counts jsonb := '{}'::jsonb;
  n_docs int := 0; n_cadex int := 0; n_emerg int := 0; n_lic int := 0; n_status int := 0;
begin
  -- 1) Documentos vencidos e a vencer
  for r in
    select d.id, d.company_id, d.valid_until, dt.name
      from company_documents d
      join document_types dt on dt.id = d.document_type_id
     where d.status in ('aprovado','vencido')
       and d.valid_until is not null
       and d.valid_until <= current_date + v_doc_warn
  loop
    if r.valid_until < current_date then
      perform cadex.notify(r.company_id, 'documento_vencido', 'critical',
        'Documento vencido: ' || r.name,
        'Vencido em ' || r.valid_until || '. Regularize para manter o CADEX ativo.',
        'company_documents', r.id::text,
        'doc_exp:' || r.id || ':' || r.valid_until);
    else
      perform cadex.notify(r.company_id, 'documento_vencendo', 'warning',
        'Documento a vencer: ' || r.name,
        'Vence em ' || r.valid_until || '.',
        'company_documents', r.id::text,
        'doc_warn:' || r.id || ':' || r.valid_until);
    end if;
    n_docs := n_docs + 1;
  end loop;

  -- 2) Recalcula situação cadastral de todas as empresas habilitadas
  for r in select id from companies
            where status in ('ativo','proximo_vencimento','pendente','deferido','inapto')
  loop
    perform cadex.refresh_company_status(r.id);
    n_status := n_status + 1;
  end loop;

  -- 3) CADEX a vencer
  for r in
    select id, legal_name, valid_until from companies
     where status in ('ativo','proximo_vencimento')
       and valid_until between current_date
                          and current_date + coalesce(cadex.param_int('cadex.warning_days'),30)
  loop
    perform cadex.notify(r.id, 'cadex_vencendo', 'warning',
      'Inscrição CADEX a vencer',
      'Sua inscrição vence em ' || r.valid_until || '. Solicite a renovação.',
      'companies', r.id::text, 'cadex_warn:' || r.id || ':' || r.valid_until);
    n_cadex := n_cadex + 1;
  end loop;

  -- 4) Emergências não regularizadas no prazo (§19, §43 Regra 5)
  for r in
    select e.id, i.executor_id, e.regularization_due_at
      from emergencies e
      join interventions i on i.id = e.intervention_id
     where e.regularized_at is null
       and e.regularization_due_at is not null
       and e.regularization_due_at < now()
  loop
    update emergencies set status = 'fora_do_prazo'
     where id = r.id and status <> 'fora_do_prazo';
    perform cadex.notify(r.executor_id, 'emergencia_fora_do_prazo', 'critical',
      'Emergência não regularizada no prazo',
      'O prazo de regularização venceu em ' || r.regularization_due_at || '.',
      'emergencies', r.id::text, 'emerg_late:' || r.id);
    n_emerg := n_emerg + 1;
  end loop;

  -- 5) Licenças vencidas
  for r in
    select l.id, l.license_number, l.valid_until, i.executor_id
      from licenses l join interventions i on i.id = l.intervention_id
     where l.status in ('deferida','em_execucao')
       and l.valid_until is not null and l.valid_until < current_date
  loop
    update licenses set status = 'vencida' where id = r.id;
    perform cadex.notify(r.executor_id, 'licenca_vencida', 'critical',
      'Licença vencida: ' || coalesce(r.license_number,'(sem número)'),
      'A licença venceu em ' || r.valid_until || '. A execução deve cessar.',
      'licenses', r.id::text, 'lic_exp:' || r.id || ':' || r.valid_until);
    n_lic := n_lic + 1;
  end loop;

  return jsonb_build_object(
    'ran_at', now(), 'documents', n_docs, 'companies_refreshed', n_status,
    'cadex_warnings', n_cadex, 'emergencies_late', n_emerg, 'licenses_expired', n_lic);
end;
$$;

-- ---------------------------------------------------------------------
-- §30 — Indicadores do painel executivo (uma chamada, não N queries)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_metrics()
returns jsonb language plpgsql stable security definer set search_path = public, cadex as $$
begin
  if not cadex.is_staff() then
    raise exception 'Painel administrativo restrito (§5).';
  end if;
  return jsonb_build_object(
    'cadex', (select jsonb_build_object(
        'total', count(*),
        'ativos', count(*) filter (where status in ('ativo','proximo_vencimento')),
        'pendentes', count(*) filter (where status in ('protocolado','em_analise','pendente')),
        'inaptos', count(*) filter (where status = 'inapto'),
        'vencendo', count(*) filter (where status = 'proximo_vencimento'))
      from companies where demo = false),
    'documentos_vencidos', (select count(*) from company_documents where status = 'vencido'),
    'obras', (select jsonb_object_agg(status, n) from (
        select l.status::text as status, count(*) n from licenses l
        join interventions i on i.id = l.intervention_id where i.demo = false
        group by 1) s),
    'manutencoes', (select jsonb_object_agg(status, n) from (
        select d.status::text as status, count(*) n from declarations d
        join interventions i on i.id = d.intervention_id where i.demo = false
        group by 1) s),
    'emergencias', (select jsonb_object_agg(status, n) from (
        select e.status::text as status, count(*) n from emergencies e
        join interventions i on i.id = e.intervention_id where i.demo = false
        group by 1) s),
    'fiscalizacao', (select jsonb_build_object(
        'total', count(*),
        'conformes', count(*) filter (where result = 'conforme'),
        'irregularidades', count(*) filter (where irregularity))
      from inspections where demo = false),
    'reincidentes', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select c.legal_name, c.cadex_number, count(*) as irregularidades
          from inspections ins join companies c on c.id = ins.company_id
         where ins.irregularity and ins.demo = false
         group by 1,2 having count(*) > 1
         order by 3 desc limit 10) x)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- §26 — consulta espacial para o mapa e para o fiscal em campo (§24)
-- ---------------------------------------------------------------------
create or replace function public.interventions_near(
  p_lng double precision, p_lat double precision, p_radius_m int default 500)
returns setof public_interventions
language sql stable security definer set search_path = public, cadex as $$
  select v.* from public_interventions v
  join interventions i on i.public_token = v.public_token
  where st_dwithin(i.geom::geography,
                   st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
                   p_radius_m)
  order by st_distance(i.geom::geography,
                       st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
$$;

grant execute on function public.interventions_near(double precision, double precision, int)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- Catálogos base (§6, §7, §12, §16, §25)
-- Estes são dados de CONFIGURAÇÃO, não dados de demonstração.
-- ---------------------------------------------------------------------
insert into qualifications (code, name) values
  ('TELECOM','Telecomunicações'),
  ('AGUA','Água'),
  ('ESGOTO','Esgoto'),
  ('GAS','Gás'),
  ('ENERGIA','Energia'),
  ('INFRA_URBANA','Infraestrutura urbana'),
  ('EXECUTORA','Empresa executora'),
  ('SUBCONTRATADA','Empresa subcontratada'),
  ('PRESTADORA','Prestadora de serviços'),
  ('CONCESSIONARIA','Concessionária'),
  ('PERMISSIONARIA','Permissionária'),
  ('OPERADORA','Operadora')
on conflict (code) do nothing;

insert into document_types (code, name, category, required, has_expiry, sort_order) values
  ('CNPJ_CARD','Cartão CNPJ','juridico_fiscal', true, false, 10),
  ('CONTRATO_SOCIAL','Contrato social / estatuto consolidado','juridico_fiscal', true, false, 20),
  ('DOC_SOCIOS','Documentos dos sócios administradores / procuradores','juridico_fiscal', true, false, 30),
  ('CND_FEDERAL','Certidão negativa federal','juridico_fiscal', true, true, 40),
  ('CND_ESTADUAL','Certidão negativa estadual','juridico_fiscal', true, true, 50),
  ('CND_MUNICIPAL','Certidão negativa municipal','juridico_fiscal', true, true, 60),
  ('CRF_FGTS','CRF / FGTS','juridico_fiscal', true, true, 70),
  ('CNDT','CNDT — débitos trabalhistas','juridico_fiscal', true, true, 80),
  ('REG_RT','Registro do responsável técnico','tecnico', true, true, 90),
  ('ART_RRT_CARGO','ART/RRT de cargo ou função','tecnico', true, true, 100),
  ('REL_EQUIPAMENTOS','Relação de equipamentos','tecnico', true, false, 110),
  ('CONTINGENTE_TECNICO','Contingente de pessoal técnico','tecnico', true, false, 120),
  ('DECL_REGULADOR','Declaração de regularidade perante órgãos reguladores','outros', false, true, 130),
  ('MAPA_INFRA','Mapa da infraestrutura própria','outros', false, false, 140),
  ('CONTRATO_COMPART','Contrato de compartilhamento de infraestrutura','outros', false, true, 150),
  ('COMPROV_ADIMPLENCIA','Comprovante de adimplência aplicável','outros', false, true, 160)
on conflict (code) do nothing;

insert into intervention_types (kind, code, name, requires_license) values
  ('obra','VALA','Abertura de valas', true),
  ('obra','ESCAVACAO','Escavação a céu aberto', true),
  ('obra','MND','Perfuração subterrânea por método não destrutivo', true),
  ('obra','POSTE','Implantação de postes', true),
  ('obra','EXPANSAO_REDE','Implantação ou expansão estrutural de redes', true),
  ('manutencao','AJUSTE','Ajuste de componentes', false),
  ('manutencao','SUBSTITUICAO','Substituição de componentes', false),
  ('manutencao','EMENDA','Emenda de fios', false),
  ('manutencao','PASSAGEM_DUTO','Passagem de cabos em dutos existentes', false),
  ('manutencao','PASSAGEM_CAIXA','Passagem de cabos em caixas subterrâneas existentes', false),
  ('manutencao','PREVENTIVA_AEREA','Manutenção preventiva de redes aéreas', false),
  ('emergencia','EMERGENCIA','Atendimento emergencial', false)
on conflict (code) do nothing;

insert into inspection_checklist_items (code, label, applies_to, sort_order) values
  ('CADEX_ATIVO','CADEX ativo', null, 10),
  ('LICENCA_VALIDA','Licença válida', 'obra', 20),
  ('AUTODECLARACAO','Autodeclaração existente', 'manutencao', 30),
  ('EMERGENCIA_REG','Emergência registrada', 'emergencia', 40),
  ('PROTOCOLO_CISP','Protocolo CISP', 'emergencia', 50),
  ('EQUIPE_IDENT','Equipe identificada', null, 60),
  ('CRACHAS','Crachás', null, 70),
  ('UNIFORMES','Uniformes', null, 80),
  ('EPIS','EPIs', null, 90),
  ('VEICULO_IDENT','Veículo identificado', null, 100),
  ('ORDEM_SERVICO','Ordem de serviço', null, 110),
  ('SERVICO_CORRESPONDE','Correspondência entre serviço executado e autorizado', null, 120),
  ('SINALIZACAO','Sinalização', null, 130),
  ('AGENTES_TRAFEGO','Agentes de apoio ao tráfego, quando aplicável', null, 140)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Wrappers públicos. O schema `cadex` NÃO é exposto pelo PostgREST — é
-- lógica interna. Só o que precisa ser chamado pela aplicação aparece
-- aqui, e cada função reaplica a checagem de papel internamente.
-- ---------------------------------------------------------------------

create or replace function public.approve_company_rpc(p_company_id uuid, p_note text default null)
returns jsonb language sql security definer set search_path = public, cadex as $$
  select to_jsonb(cadex.approve_company(p_company_id, p_note));
$$;

create or replace function public.approve_license_rpc(
  p_license_id uuid, p_valid_until date, p_note text default null)
returns jsonb language sql security definer set search_path = public, cadex as $$
  select to_jsonb(cadex.approve_license(p_license_id, p_valid_until, p_note));
$$;

create or replace function public.start_intervention_rpc(p_intervention_id uuid)
returns jsonb language sql security definer set search_path = public, cadex as $$
  select to_jsonb(cadex.start_intervention(p_intervention_id));
$$;

create or replace function public.regularize_emergency_rpc(p_emergency_id uuid)
returns jsonb language sql security definer set search_path = public, cadex as $$
  select to_jsonb(cadex.regularize_emergency(p_emergency_id));
$$;

-- Varredura de prazos: restrita a admin quando disparada pela aplicação.
-- O agendamento automático roda como service_role (ver DEPLOY.md).
create or replace function public.run_deadline_sweep_rpc()
returns jsonb language plpgsql security definer set search_path = public, cadex as $$
begin
  if not cadex.has_role('admin') then
    raise exception 'Varredura de prazos restrita ao Administrador (§5.1).';
  end if;
  return cadex.run_deadline_sweep();
end;
$$;

grant execute on function
  public.approve_company_rpc(uuid, text),
  public.approve_license_rpc(uuid, date, text),
  public.start_intervention_rpc(uuid),
  public.regularize_emergency_rpc(uuid),
  public.run_deadline_sweep_rpc(),
  public.dashboard_metrics(),
  public.verify_badge(text)
  to authenticated;
