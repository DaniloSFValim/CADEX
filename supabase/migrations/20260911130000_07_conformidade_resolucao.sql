-- =====================================================================
-- CADEX — 07: conformidade com o texto oficial da
-- RESOLUÇÃO CONJUNTA SECONSER/SEOP Nº 001, DE 09 DE SETEMBRO DE 2026
-- (Município de Niterói — Lei Municipal nº 3.988/2025)
--
-- Esta migration é ADITIVA e corrige as divergências apuradas na
-- conferência do articulado. Cada bloco cita o dispositivo que o
-- fundamenta. A partir daqui, `legal_basis` deixa de ser nulo.
--
-- DIVERGÊNCIA GRAVE CORRIGIDA AQUI:
--   O prazo de 24 horas do art. 20 corre da CONCLUSÃO DO ATENDIMENTO
--   ("Concluído o atendimento, a empresa executora dispõe do prazo de
--   24 (vinte e quatro) horas"), e não do acionamento do CISP. A
--   implementação anterior contava do acionamento, o que antecipava
--   indevidamente o termo final e poderia gerar autuação indevida com
--   base no inciso III do Anexo Único da Lei nº 3.988/2025.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Art. 20, parágrafo único — a intervenção pode ser desqualificada a
-- posteriori se não se enquadrar nas hipóteses do art. 18.
-- ---------------------------------------------------------------------
alter type emergency_status add value if not exists 'nao_enquadrada';

-- ---------------------------------------------------------------------
-- Rastreabilidade normativa nos catálogos
-- ---------------------------------------------------------------------
alter table intervention_types          add column if not exists legal_basis text;
alter table inspection_checklist_items  add column if not exists legal_basis text;
alter table inspection_checklist_items  add column if not exists sanction_reference text;
alter table system_parameters           add column if not exists sanction_reference text;

comment on column system_parameters.legal_basis is
  'Dispositivo da Resolução Conjunta SECONSER/SEOP nº 001/2026 que fixa o parâmetro.';
comment on column system_parameters.sanction_reference is
  'Inciso do Anexo Único da Lei Municipal nº 3.988/2025 aplicável ao descumprimento.';

-- ---------------------------------------------------------------------
-- Art. 2º, VII — "trecho: a extensão contínua de via, logradouro ou faixa
-- de servidão objeto de uma única licença, DELIMITADA POR COORDENADAS
-- GEOGRÁFICAS DE INÍCIO E DE FIM".
-- O trecho era descrito por texto livre; a norma exige coordenadas.
-- ---------------------------------------------------------------------
alter table interventions
  add column if not exists segment_start geometry(Point, 4326),
  add column if not exists segment_end   geometry(Point, 4326);

comment on column interventions.segment_start is
  'Coordenada de início do trecho (art. 2º, VII). Obrigatória em obra de infraestrutura.';
comment on column interventions.segment_end is
  'Coordenada de fim do trecho (art. 2º, VII). Obrigatória em obra de infraestrutura.';

create index if not exists idx_interventions_segment_start
  on interventions using gist (segment_start);
create index if not exists idx_interventions_segment_end
  on interventions using gist (segment_end);

-- Art. 11 c/c art. 2º, VII — a licença é expedida "individualmente por
-- trecho ou projeto"; quando o objeto é trecho, as coordenadas de início
-- e fim são elemento essencial da delimitação.
create or replace function cadex.check_segment_coordinates()
returns trigger language plpgsql as $$
begin
  if new.kind = 'obra'
     and (new.segment_from is not null or new.segment_to is not null)
     and (new.segment_start is null or new.segment_end is null) then
    raise exception
      'Trecho de obra deve ser delimitado por coordenadas de início e de fim (art. 2º, VII).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_interventions_segment on interventions;
create trigger trg_interventions_segment
  before insert or update of segment_from, segment_to, segment_start, segment_end
  on interventions
  for each row execute function cadex.check_segment_coordinates();

-- ---------------------------------------------------------------------
-- Art. 18 — a emergência só existe nas duas hipóteses legais.
-- Art. 19, § 1º — a comunicação ao 153 deve informar, obrigatoriamente,
-- CADEX, endereço, natureza do risco, TIPO E PLACA DO VEÍCULO e nome,
-- identidade e telefone do responsável presente no local.
-- ---------------------------------------------------------------------
alter table emergencies
  add column if not exists risk_category text,
  add column if not exists vehicle_kind  text,
  add column if not exists vehicle_plate text;

comment on column emergencies.risk_category is
  'Hipótese do art. 18: I risco iminente; II restabelecimento de serviço essencial.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'emergencies_risk_category_check') then
    alter table emergencies add constraint emergencies_risk_category_check
      check (risk_category is null or risk_category in ('risco_iminente','servico_essencial'));
  end if;
end $$;

-- Art. 19, caput — "sendo obrigatório o acionamento telefônico do número
-- 153 (CISP) NO MOMENTO DO DESLOCAMENTO DA EQUIPE": não há deslocamento
-- regular sem protocolo, e o protocolo não pode ser posterior ao
-- deslocamento.
create or replace function cadex.check_emergency_dispatch()
returns trigger language plpgsql as $$
declare v_called timestamptz;
begin
  if new.dispatched_at is not null then
    if new.cisp_protocol_id is null then
      raise exception
        'Deslocamento de equipe em emergência exige acionamento prévio do CISP 153 (art. 19).';
    end if;
    select called_at into v_called from cisp_protocols where id = new.cisp_protocol_id;
    if v_called > new.dispatched_at then
      raise exception
        'Acionamento do CISP (%) posterior ao deslocamento (%) — o art. 19 exige o acionamento no momento do deslocamento.',
        v_called, new.dispatched_at;
    end if;
  end if;

  -- Art. 19, § 1º: conteúdo mínimo da comunicação.
  if new.cisp_protocol_id is not null then
    if coalesce(new.vehicle_kind,'') = '' or coalesce(new.vehicle_plate,'') = '' then
      raise exception
        'A comunicação ao CISP deve informar tipo e placa do veículo utilizado (art. 19, § 1º).';
    end if;
    if coalesce(new.on_site_responsible_name,'') = ''
       or coalesce(new.on_site_responsible_doc,'') = ''
       or coalesce(new.on_site_responsible_phone,'') = '' then
      raise exception
        'A comunicação ao CISP deve informar nome, identidade e telefone do responsável presente no local (art. 19, § 1º).';
    end if;
    if coalesce(new.risk_nature,'') = '' then
      raise exception 'A comunicação ao CISP deve informar a natureza do risco (art. 19, § 1º).';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_emergency_dispatch on emergencies;
create trigger trg_emergency_dispatch
  before insert or update on emergencies
  for each row execute function cadex.check_emergency_dispatch();

-- ---------------------------------------------------------------------
-- Art. 20 — CORREÇÃO DO TERMO INICIAL DO PRAZO DE 24 HORAS.
-- "Concluído o atendimento, a empresa executora dispõe do prazo de
--  24 (vinte e quatro) horas para registrar no sistema eletrônico o
--  número do protocolo do CISP, as imagens e o escopo do serviço."
-- O prazo corre da CONCLUSÃO, não do acionamento. Enquanto o
-- atendimento não é concluído, não há prazo em curso.
-- ---------------------------------------------------------------------
create or replace function cadex.set_emergency_deadline()
returns trigger language plpgsql as $$
declare v_hours int := coalesce(cadex.param_int('emergency.regularization_hours'), 24);
begin
  if new.concluded_at is not null then
    new.regularization_due_at := new.concluded_at + (v_hours || ' hours')::interval;
  else
    -- Atendimento em curso: o prazo do art. 20 ainda não começou a correr.
    new.regularization_due_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_emergency_deadline on emergencies;
create trigger trg_emergency_deadline
  before insert or update of concluded_at on emergencies
  for each row execute function cadex.set_emergency_deadline();

-- Recalcula o que havia sido gravado sob a regra anterior.
update emergencies e
   set regularization_due_at = case
         when e.concluded_at is null then null
         else e.concluded_at
              + (coalesce(cadex.param_int('emergency.regularization_hours'), 24) || ' hours')::interval
       end;

-- Art. 20 — a regularização exige os três elementos do caput e pressupõe
-- atendimento concluído.
create or replace function cadex.regularize_emergency(p_emergency_id uuid)
returns emergencies language plpgsql security definer set search_path = public, cadex as $$
declare e emergencies%rowtype;
begin
  select * into e from emergencies where id = p_emergency_id for update;
  if not found then raise exception 'Emergência não encontrada.'; end if;

  if e.concluded_at is null then
    raise exception
      'O prazo do art. 20 corre da conclusão do atendimento; registre a conclusão antes de regularizar.';
  end if;
  if e.cisp_protocol_id is null then
    raise exception 'A regularização exige o número do protocolo do CISP (art. 20).';
  end if;
  if coalesce(e.executed_service,'') = '' then
    raise exception 'A regularização exige o escopo do serviço executado (art. 20).';
  end if;
  if not exists (select 1 from emergency_photos where emergency_id = p_emergency_id) then
    raise exception 'A regularização exige as imagens do atendimento (art. 20).';
  end if;

  update emergencies
     set regularized_at = now(),
         status = case
           when now() > e.regularization_due_at then 'fora_do_prazo'::emergency_status
           else 'regularizada'::emergency_status end
   where id = p_emergency_id
   returning * into e;
  return e;
end;
$$;

-- Art. 20, parágrafo único, parte final — desqualificação da emergência
-- que não se enquadre no art. 18. Ato de análise, restrito à SECONSER.
create or replace function cadex.disqualify_emergency(p_emergency_id uuid, p_reason text)
returns emergencies language plpgsql security definer set search_path = public, cadex as $$
declare e emergencies%rowtype;
begin
  if not cadex.has_any_role(array['admin','gestor_seconser','analista_seconser']::user_role[]) then
    raise exception 'Desqualificação de emergência restrita à análise da SECONSER (art. 20, parágrafo único).';
  end if;
  if coalesce(p_reason,'') = '' then
    raise exception 'A desqualificação deve ser motivada.';
  end if;

  update emergencies set status = 'nao_enquadrada'
   where id = p_emergency_id returning * into e;
  if not found then raise exception 'Emergência não encontrada.'; end if;

  insert into audit_logs (actor_id, action, entity, entity_id, note)
  values (auth.uid(), 'DESQUALIFICACAO_ART18', 'emergencies', p_emergency_id::text, p_reason);

  return e;
end;
$$;

-- ---------------------------------------------------------------------
-- Art. 25, caput — a ordem de serviço é "subscrita por seu responsável
-- técnico ou por preposto por ele designado". A subscrição é elemento
-- de validade, não campo opcional.
-- Art. 25, § 1º — conteúdo obrigatório da OS.
-- ---------------------------------------------------------------------
alter table work_orders
  add column if not exists signed_by_name text,
  add column if not exists signed_by_role text,
  add column if not exists signed_by_technical_responsible_id uuid
    references technical_responsibles(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'work_orders_signed_by_role_check') then
    alter table work_orders add constraint work_orders_signed_by_role_check
      check (signed_by_role is null or signed_by_role in ('responsavel_tecnico','preposto'));
  end if;
end $$;

create or replace function cadex.check_work_order_signature()
returns trigger language plpgsql as $$
begin
  if coalesce(new.signed_by_name,'') = '' or new.signed_by_role is null then
    raise exception
      'A ordem de serviço deve ser subscrita pelo responsável técnico ou por preposto por ele designado (art. 25).';
  end if;
  if new.signed_by_role = 'preposto'
     and new.signed_by_technical_responsible_id is null then
    raise exception
      'O preposto deve ser designado por responsável técnico identificado (art. 25).';
  end if;
  if coalesce(new.responsible_name,'') = '' then
    raise exception
      'A ordem de serviço deve identificar o responsável pela equipe (art. 25, § 1º).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_order_signature on work_orders;
create trigger trg_work_order_signature
  before insert or update on work_orders
  for each row execute function cadex.check_work_order_signature();

-- Art. 25, § 1º — quando houver subcontratada, a OS indica seu número de
-- CADEX. O número é derivado, não digitado: evita divergência com o
-- cadastro.
create or replace view work_orders_full
with (security_invoker = true) as
  select w.*,
         exec.legal_name    as executor_name,
         exec.cadex_number  as executor_cadex,
         sub.legal_name     as subcontractor_name,
         sub.cadex_number   as subcontractor_cadex,
         conc.legal_name    as concessionaire_name
    from work_orders w
    join companies exec on exec.id = w.executor_id
    left join companies sub  on sub.id  = w.subcontractor_id
    left join companies conc on conc.id = w.concessionaire_id;

grant select on work_orders_full to authenticated;

-- ---------------------------------------------------------------------
-- Art. 6º, II, "c" — "relação descritiva de equipamentos E DO CONTINGENTE
-- DE PESSOAL TÉCNICO" é UM documento, não dois. A separação anterior
-- criava exigência documental inexistente na norma.
-- ---------------------------------------------------------------------
do $$
declare v_keep uuid; v_drop uuid;
begin
  select id into v_keep from document_types where code = 'REL_EQUIPAMENTOS';
  select id into v_drop from document_types where code = 'CONTINGENTE_TECNICO';
  if v_keep is not null and v_drop is not null then
    update company_documents set document_type_id = v_keep where document_type_id = v_drop;
    update document_types
       set name = 'Relação descritiva de equipamentos e do contingente de pessoal técnico'
     where id = v_keep;
    delete from document_types where id = v_drop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Art. 6º — fundamentação de cada exigência documental.
-- ---------------------------------------------------------------------
update document_types set legal_basis = v.basis, required = v.req
  from (values
    ('CNPJ_CARD',            'Art. 6º, I, "a"',  true),
    ('CONTRATO_SOCIAL',      'Art. 6º, I, "b"',  true),
    ('DOC_SOCIOS',           'Art. 6º, I, "c"',  true),
    ('CND_FEDERAL',          'Art. 6º, I, "d"',  true),
    ('CND_ESTADUAL',         'Art. 6º, I, "e"',  true),
    ('CND_MUNICIPAL',        'Art. 6º, I, "f"',  true),
    ('CRF_FGTS',             'Art. 6º, I, "g"',  true),
    ('CNDT',                 'Art. 6º, I, "h"',  true),
    ('REG_RT',               'Art. 6º, II, "a"', true),
    ('ART_RRT_CARGO',        'Art. 6º, II, "b"', true),
    ('REL_EQUIPAMENTOS',     'Art. 6º, II, "c"', true),
    ('DECL_REGULADOR',       'Art. 6º, III',     true),
    ('MAPA_INFRA',           'Art. 6º, IV',      false),
    ('CONTRATO_COMPART',     'Art. 6º, V',       false),
    ('COMPROV_ADIMPLENCIA',  'Art. 6º, V',       false)
  ) as v(code, basis, req)
 where document_types.code = v.code;

-- Art. 6º, IV — o mapa da infraestrutura própria é exigido em ARQUIVO
-- DIGITAL VETORIAL GEORREFERENCIADO, limitado à infraestrutura instalada
-- em bem público e resguardado o sigilo legal.
update document_types
   set name = 'Mapa da infraestrutura própria (arquivo digital vetorial georreferenciado)',
       has_expiry = false
 where code = 'MAPA_INFRA';

-- Art. 6º, III — a declaração é "de caráter estritamente declaratório,
-- sem delegação de competência regulatória ao Município": não há prazo
-- de validade a controlar, e o Município não a valida no mérito.
update document_types set has_expiry = false where code = 'DECL_REGULADOR';

-- Art. 6º, V — a adimplência é "relativa EXCLUSIVAMENTE às instalações
-- localizadas em Niterói".
update document_types
   set name = 'Comprovante de adimplência das instalações localizadas em Niterói'
 where code = 'COMPROV_ADIMPLENCIA';

-- ---------------------------------------------------------------------
-- Arts. 7º, 8º, 13 e 20 — prazos, agora com fundamento e sanção.
-- ---------------------------------------------------------------------
update system_parameters set legal_basis = v.basis, sanction_reference = v.sanc,
       description = coalesce(v.descr, description)
  from (values
    ('cadex.analysis_business_days',   'Art. 7º, caput',
     null, 'Prazo de decisão da SECONSER sobre o requerimento de inscrição'),
    ('cadex.validity_months',          'Art. 7º, § 1º',
     null, 'Validade da inscrição deferida, renovável mediante atualização documental'),
    ('cadex.remediation_days',         'Art. 8º, caput',
     null, 'Prazo de saneamento após notificação por documento expirado ou não renovado'),
    ('license.analysis_business_days', 'Art. 13, caput',
     null, 'Prazo de decisão da SECONSER sobre o pedido de licença'),
    ('emergency.regularization_hours', 'Art. 20, caput',
     'Anexo Único, inciso III, da Lei Municipal nº 3.988/2025',
     'Prazo, contado da CONCLUSÃO DO ATENDIMENTO, para registro do protocolo do CISP, das imagens e do escopo'),
    ('transition.days',                'Art. 29, caput',
     null, 'Prazo para protocolo do pedido de inscrição pelas empresas que já atuavam na data da publicação')
  ) as v(key, basis, sanc, descr)
 where system_parameters.key = v.key;

-- Parâmetros de alerta: são decisão de gestão do sistema, não prazo
-- normativo. Marcados como tais para não se confundirem com a norma.
update system_parameters
   set legal_basis = 'Parâmetro operacional do sistema — sem previsão normativa; antecedência de alerta'
 where key in ('cadex.warning_days','document.warning_days');

-- Art. 29 — o prazo de 60 dias conta da publicação da Resolução.
insert into system_parameters (key, value, description, unit, legal_basis) values
  ('resolution.published_on', '{"value":"2026-09-09"}',
   'Data de publicação da Resolução Conjunta SECONSER/SEOP nº 001/2026', 'data',
   'Art. 31'),
  ('transition.deadline', '{"value":"2026-11-08"}',
   'Termo final do prazo do art. 29 para protocolo do pedido de inscrição no CADEX',
   'data', 'Art. 29, caput')
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      legal_basis = excluded.legal_basis;

comment on table system_parameters is
  'Parâmetros normativos e operacionais. Art. 30: os casos omissos são resolvidos
   conjuntamente pelos titulares da SECONSER e da SEOP — alterações aqui devem
   refletir ato dessas autoridades, não conveniência de implementação.';

-- ---------------------------------------------------------------------
-- Arts. 10 e 15 — fundamentação do catálogo de intervenções.
-- ---------------------------------------------------------------------
update intervention_types set legal_basis = 'Art. 10' where kind = 'obra';
update intervention_types set legal_basis = 'Art. 15' where kind = 'manutencao';
update intervention_types set legal_basis = 'Art. 18' where kind = 'emergencia';

-- Art. 15 — o critério legal da manutenção rotineira é NÃO MODIFICAR A
-- ESTRUTURA DA VIA; os casos listados são exemplificativos ("tais como").
comment on column intervention_types.requires_license is
  'Art. 11 c/c art. 16. Obra de infraestrutura (art. 10) exige licença prévia;
   manutenção rotineira (art. 15 — atividade que não modifica a estrutura da via)
   não exige. O rol do art. 15 é exemplificativo.';

-- ---------------------------------------------------------------------
-- Capítulo IV — checklist de fiscalização ancorado no articulado.
-- ---------------------------------------------------------------------
update inspection_checklist_items set legal_basis = v.basis, sanction_reference = v.sanc,
       label = coalesce(v.lbl, label)
  from (values
    ('CADEX_ATIVO',        'Art. 3º, caput e § 1º',
     'Anexo Único, inciso XXI, da Lei Municipal nº 3.988/2025',
     'Inscrição ativa no CADEX (executora e subcontratada, em qualquer grau)'),
    ('LICENCA_VALIDA',     'Art. 11', null,
     'Licença de execução vigente para o trecho ou projeto'),
    ('AUTODECLARACAO',     'Art. 17',
     'Anexo Único, inciso IV, da Lei Municipal nº 3.988/2025',
     'Registro prévio do cronograma georreferenciado e do roteiro'),
    ('EMERGENCIA_REG',     'Art. 20',
     'Anexo Único, inciso III, da Lei Municipal nº 3.988/2025',
     'Registro do atendimento de emergência no prazo de 24 horas da conclusão'),
    ('PROTOCOLO_CISP',     'Art. 19, § 2º', null,
     'Protocolo do CISP portado pela equipe e exibido de imediato'),
    ('EQUIPE_IDENT',       'Art. 22', null,
     'Profissional com identificação civil e corporativa'),
    ('CRACHAS',            'Art. 23', null,
     'Crachá visível com foto, nome, documento, função, empresa e validade'),
    ('UNIFORMES',          'Art. 24, caput e § 1º', null,
     'Uniforme com identificação da empresa legível à distância'),
    ('EPIS',               'Art. 24, caput', null,
     'Equipamentos de proteção individual exigidos pela atividade'),
    ('VEICULO_IDENT',      'Art. 21, parágrafo único', null,
     'Veículo com nome da empresa em ambas as laterais e da concessionária contratante na traseira'),
    ('ORDEM_SERVICO',      'Art. 25, caput e § 1º', null,
     'Ordem de serviço subscrita, portada pela equipe e exibida de imediato'),
    ('SERVICO_CORRESPONDE','Art. 11 c/c art. 17', null,
     'Correspondência entre o serviço executado e o autorizado ou autodeclarado'),
    ('SINALIZACAO',        'Art. 24, § 2º', null,
     'Sinalização da intervenção na via'),
    ('AGENTES_TRAFEGO',    'Art. 28 c/c Lei Municipal nº 4.038/2025', null,
     'Agentes de apoio ao tráfego, quando a intervenção impacta a circulação viária')
  ) as v(code, basis, sanc, lbl)
 where inspection_checklist_items.code = v.code;

-- Art. 24, § 2º — exigência específica e verificável em campo.
insert into inspection_checklist_items (code, label, applies_to, sort_order, legal_basis) values
  ('FAIXAS_RETRORREFLETIVAS',
   'Faixas retrorrefletivas no uniforme (intervenção em altura, via de tráfego ou espaço confinado)',
   null, 135, 'Art. 24, § 2º')
on conflict (code) do update set legal_basis = excluded.legal_basis;

-- Art. 21 — a identificação do veículo é exigida tanto da executora
-- quanto da subcontratada.
comment on table vehicles is
  'Art. 21: veículo ou maquinário empregado em via pública pela empresa executora
   OU por empresa subcontratada. Parágrafo único: nome da empresa em ambas as
   laterais; nome da concessionária contratante na traseira.';

comment on table team_members is
  'Art. 23: o crachá funcional identifica a EMPRESA EMPREGADORA — que, no caso de
   equipe subcontratada, é a subcontratada, não a executora contratante.';

-- ---------------------------------------------------------------------
-- Art. 8º, § 3º — "A habilitação é restabelecida após o saneamento das
-- pendências". Função explícita para o ato de restabelecimento, de modo
-- que ele apareça na trilha do processo e não apenas como efeito
-- colateral do recálculo automático.
-- ---------------------------------------------------------------------
create or replace function cadex.reinstate_company(p_company_id uuid, p_note text default null)
returns companies language plpgsql security definer set search_path = public, cadex as $$
declare c companies%rowtype; v_pending int;
begin
  if not cadex.has_any_role(array['admin','gestor_seconser','analista_seconser']::user_role[]) then
    raise exception 'Restabelecimento de habilitação restrito à SECONSER (art. 8º, § 3º).';
  end if;

  select count(*) into v_pending from company_documents
   where company_id = p_company_id and status in ('vencido','rejeitado','pendente_envio');
  if v_pending > 0 then
    raise exception 'Há % pendência(s) documental(is) não saneada(s) (art. 8º, § 3º).', v_pending;
  end if;

  update companies
     set remediation_due_date = null,
         status = 'ativo'
   where id = p_company_id
     and valid_until >= current_date
   returning * into c;

  if not found then
    raise exception 'Inscrição vencida: o restabelecimento do art. 8º, § 3º pressupõe validade vigente (art. 7º, § 1º).';
  end if;

  insert into administrative_events (company_id, kind, note, actor_id)
  values (p_company_id, 'saneamento', coalesce(p_note, 'Habilitação restabelecida (art. 8º, § 3º).'), auth.uid());

  perform cadex.refresh_company_status(p_company_id);
  select * into c from companies where id = p_company_id;
  return c;
end;
$$;

create or replace function public.reinstate_company_rpc(p_company_id uuid, p_note text default null)
returns jsonb language sql security definer set search_path = public, cadex as $$
  select to_jsonb(cadex.reinstate_company(p_company_id, p_note));
$$;

create or replace function public.disqualify_emergency_rpc(p_emergency_id uuid, p_reason text)
returns jsonb language sql security definer set search_path = public, cadex as $$
  select to_jsonb(cadex.disqualify_emergency(p_emergency_id, p_reason));
$$;

grant execute on function
  public.reinstate_company_rpc(uuid, text),
  public.disqualify_emergency_rpc(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- Art. 7º, § 2º — "A relação das empresas com CADEX ativo é publicada e
-- mantida atualizada em sítio eletrônico da Prefeitura, para consulta
-- pública e para o exercício do poder de polícia pelos Fiscais do Sistema
-- Viário e da Guarda Civil Municipal."
-- A publicação é obrigação normativa, não escolha de produto.
-- ---------------------------------------------------------------------
comment on view public_companies is
  'Art. 7º, § 2º: publicação obrigatória da relação de empresas com CADEX ativo,
   para consulta pública e exercício do poder de polícia (art. 17, parágrafo único,
   da Lei Municipal nº 3.988/2025).';

comment on view public_interventions is
  'Art. 14: publicidade do canteiro de obra — razão social da executora, número da
   licença, escopo e data prevista de encerramento, acessíveis por QR Code.';

-- ---------------------------------------------------------------------
-- Art. 29 — acompanhamento do prazo transitório.
-- ---------------------------------------------------------------------
create or replace function public.transition_status()
returns jsonb language plpgsql stable security definer set search_path = public, cadex as $$
declare v_deadline date;
begin
  if not cadex.is_staff() then
    raise exception 'Consulta restrita (art. 7º, § 2º).';
  end if;
  select (value->>'value')::date into v_deadline
    from system_parameters where key = 'transition.deadline';

  return jsonb_build_object(
    'deadline', v_deadline,
    'days_remaining', v_deadline - current_date,
    'expired', v_deadline < current_date,
    'protocoladas_no_prazo', (
      select count(*) from companies
       where demo = false and protocolled_at is not null
         and protocolled_at::date <= v_deadline),
    'protocoladas_fora_do_prazo', (
      select count(*) from companies
       where demo = false and protocolled_at is not null
         and protocolled_at::date > v_deadline),
    'nota', 'Art. 29, parágrafo único: as obrigações do Capítulo IV (acionamento do '
            'CISP e identificação de veículos e de pessoal) são de cumprimento '
            'imediato, independentemente deste prazo.'
  );
end;
$$;

grant execute on function public.transition_status() to authenticated;

-- ---------------------------------------------------------------------
-- Art. 2º, VII c/c art. 14 — a publicação do trecho passa a expor as
-- coordenadas de início e fim, que são a delimitação legal do objeto da
-- licença. São dados da obra, não dados pessoais.
-- ---------------------------------------------------------------------
-- `create or replace view` não permite inserir coluna no meio da lista.
-- As funções que dependem da view são recriadas logo abaixo, idênticas.
drop function if exists public.interventions_near(double precision, double precision, int);
drop function if exists public.verify_public_token(text);
drop view if exists public_interventions;

create view public_interventions
with (security_invoker = false) as
  select i.public_token,
         i.kind,
         it.name              as type_name,
         exec.legal_name      as executor_name,
         exec.cadex_number    as executor_cadex,
         conc.legal_name      as concessionaire_name,
         l.license_number,
         d.declaration_number,
         i.scope,
         i.description,
         i.street, i.district, i.segment_from, i.segment_to,
         st_asgeojson(i.segment_start)::jsonb as segment_start,
         st_asgeojson(i.segment_end)::jsonb   as segment_end,
         i.starts_on, i.ends_on, i.started_at, i.finished_at,
         coalesce(l.status::text, d.status::text, e.status::text) as status,
         st_asgeojson(i.geom)::jsonb as geometry
    from interventions i
    join companies exec on exec.id = i.executor_id
    left join companies conc on conc.id = i.concessionaire_id
    left join intervention_types it on it.id = i.type_id
    left join licenses l     on l.intervention_id = i.id
    left join declarations d on d.intervention_id = i.id
    left join emergencies e  on e.intervention_id = i.id
   where i.demo = false
     and (l.status in ('deferida','em_execucao','concluida')
          or d.status in ('registrada','equipe_em_deslocamento','em_execucao','encerrada')
          -- Art. 20, parágrafo único: emergência desqualificada sai da
          -- publicação como intervenção regular.
          or e.status in ('em_atendimento','regularizada','encerrada','fora_do_prazo'));

comment on view public_interventions is
  'Art. 14: publicidade do canteiro — razão social da executora, número da licença,
   escopo e data prevista de encerramento, acessíveis por QR Code. Art. 2º, VII: o
   trecho é publicado com suas coordenadas de início e fim.';

grant select on public_interventions to anon, authenticated;

-- Recriação das funções que dependiam da view (sem alteração de contrato).
create or replace function public.verify_public_token(p_token text)
returns jsonb language sql stable security definer set search_path = public, cadex as $$
  select coalesce(
    (select to_jsonb(v) from public_interventions v where v.public_token = p_token),
    jsonb_build_object('found', false)
  );
$$;

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

grant execute on function public.verify_public_token(text) to anon, authenticated;
grant execute on function public.interventions_near(double precision, double precision, int)
  to anon, authenticated;
