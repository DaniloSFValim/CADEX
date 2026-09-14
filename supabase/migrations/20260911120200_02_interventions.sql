-- =====================================================================
-- CADEX — 02: intervenções (§11 a §19, §26, §27)
-- Três workflows DISTINTOS sobre um núcleo georreferenciado comum:
--   obra        -> licença prévia          (§12–§15)
--   manutencao  -> autodeclaração prévia   (§16–§17)
--   emergencia  -> protocolo CISP 153      (§18–§19)
-- O núcleo comum existe para mapa, fiscalização e consulta pública;
-- ele NÃO unifica os workflows nem seus status.
-- =====================================================================

-- Extensões vivem em `extensions`, não em `public` (ver migration 00).
set search_path = public, extensions;

create table intervention_types (
  id          uuid primary key default uuid_generate_v4(),
  kind        intervention_kind not null,
  code        text not null unique,
  name        text not null,
  description text,
  requires_license boolean not null default false,   -- §43 Regra 2
  active      boolean not null default true
);

-- ---------------------------------------------------------------------
-- Núcleo da intervenção — §11: papéis explicitamente separados
-- ---------------------------------------------------------------------
create table interventions (
  id                   uuid primary key default uuid_generate_v4(),
  kind                 intervention_kind not null,
  type_id              uuid references intervention_types(id),

  -- §11 — três entidades diferentes, três colunas diferentes.
  concessionaire_id    uuid references companies(id),   -- contratante
  executor_id          uuid not null references companies(id),
  subcontractor_id     uuid references companies(id),   -- executora de fato

  technical_responsible_id uuid references technical_responsibles(id),

  -- Situação cadastral congelada no momento do registro (§11: preservar
  -- as relações no histórico, mesmo que a empresa mude de status depois).
  snapshot             jsonb not null default '{}'::jsonb,

  -- Localização (§27) — geometria real, nunca coordenada textual.
  geom                 geometry(Geometry, 4326) not null,
  address              text,
  street               text,
  district             text,
  segment_from         text,
  segment_to           text,
  length_m             numeric(12,2),

  description          text not null,
  scope                text,
  construction_method  text,
  affected_infrastructure text,

  starts_on            date,
  ends_on              date,
  started_at           timestamptz,
  finished_at          timestamptz,

  -- Chave pública opaca usada no QR Code (§14, §15, §24). Não expõe o UUID
  -- interno e pode ser revogada sem alterar a intervenção.
  public_token         text not null unique
                         default encode(gen_random_bytes(16), 'hex'),

  demo                 boolean not null default false,
  created_by           uuid references profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_interventions_geom on interventions using gist (geom);
create index idx_interventions_kind on interventions (kind, created_at desc);
create index idx_interventions_executor on interventions (executor_id);
create index idx_interventions_conc on interventions (concessionaire_id);
create index idx_interventions_token on interventions (public_token);

create trigger trg_interventions_touch
  before update on interventions
  for each row execute function cadex.touch_updated_at();

-- §43 Regras 1 e 6: executora, subcontratada e concessionária precisam de
-- CADEX ativo. Validado no banco, não apenas no frontend.
create or replace function cadex.check_intervention_parties()
returns trigger language plpgsql as $$
begin
  if not cadex.is_company_active(new.executor_id) then
    raise exception 'Empresa executora sem CADEX ativo (§43 Regra 1).';
  end if;
  if new.subcontractor_id is not null
     and not cadex.is_company_active(new.subcontractor_id) then
    raise exception 'Empresa subcontratada sem CADEX ativo (§43 Regra 6).';
  end if;
  if new.concessionaire_id is not null
     and not cadex.is_company_active(new.concessionaire_id) then
    raise exception 'Concessionária contratante sem CADEX ativo (§43 Regra 1).';
  end if;

  if tg_op = 'INSERT' then
    new.snapshot := jsonb_build_object(
      'registered_at', now(),
      'executor', (select jsonb_build_object('id',id,'cnpj',cnpj,'legal_name',legal_name,
                     'cadex_number',cadex_number,'status',status,'valid_until',valid_until)
                     from companies where id = new.executor_id),
      'subcontractor', (select jsonb_build_object('id',id,'cnpj',cnpj,'legal_name',legal_name,
                     'cadex_number',cadex_number,'status',status,'valid_until',valid_until)
                     from companies where id = new.subcontractor_id),
      'concessionaire', (select jsonb_build_object('id',id,'cnpj',cnpj,'legal_name',legal_name,
                     'cadex_number',cadex_number,'status',status,'valid_until',valid_until)
                     from companies where id = new.concessionaire_id)
    );
  end if;
  return new;
end;
$$;

create trigger trg_interventions_parties
  before insert or update of executor_id, subcontractor_id, concessionaire_id
  on interventions
  for each row execute function cadex.check_intervention_parties();

-- ---------------------------------------------------------------------
-- §12–§15 — Licença de obra de infraestrutura
-- ---------------------------------------------------------------------
create sequence license_number_seq;

create table licenses (
  id               uuid primary key default uuid_generate_v4(),
  intervention_id  uuid not null unique references interventions(id) on delete cascade,
  protocol_number  text unique,
  license_number   text unique,
  status           license_status not null default 'rascunho',
  purpose          text,
  protocolled_at   timestamptz,
  analysis_due_date date,                  -- §31: 20 dias úteis
  decided_at       timestamptz,
  decided_by       uuid references profiles(id),
  decision_note    text,
  issued_at        timestamptz,
  valid_from       date,
  valid_until      date,                   -- §31: vinculada ao cronograma
  schedule         jsonb,                  -- cronograma físico
  pdf_path         text,                   -- Storage: licença emitida
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_licenses_touch
  before update on licenses
  for each row execute function cadex.touch_updated_at();

alter table administrative_events
  add constraint fk_admin_events_license
  foreign key (license_id) references licenses(id) on delete cascade;

create table license_documents (
  id            uuid primary key default uuid_generate_v4(),
  license_id    uuid not null references licenses(id) on delete cascade,
  kind          text not null
                  check (kind in ('planta_locacao','cronograma_fisico',
                                  'art_rrt','geoespacial','complementar')),
  storage_path  text not null,
  file_name     text not null,
  file_size     bigint not null,
  mime_type     text not null,
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);

-- §43 Regra 2 + §12: obra não inicia sem licença deferida.
create or replace function cadex.start_intervention(p_intervention_id uuid)
returns interventions language plpgsql security definer set search_path = public, cadex, extensions as $$
declare i interventions%rowtype; l licenses%rowtype;
begin
  select * into i from interventions where id = p_intervention_id for update;
  if not found then raise exception 'Intervenção não encontrada.'; end if;

  if i.kind = 'obra' then
    select * into l from licenses where intervention_id = i.id;
    if l.status is distinct from 'deferida' then
      raise exception 'Obra não pode iniciar sem licença deferida (§12, §43 Regra 2). Situação: %',
        coalesce(l.status::text,'sem licença');
    end if;
    if l.valid_until is not null and l.valid_until < current_date then
      raise exception 'Licença vencida em %.', l.valid_until;
    end if;
    update licenses set status = 'em_execucao' where id = l.id;
  end if;

  update interventions set started_at = now() where id = i.id returning * into i;
  return i;
end;
$$;

create or replace function cadex.approve_license(p_license_id uuid, p_valid_until date, p_note text default null)
returns licenses language plpgsql security definer set search_path = public, cadex, extensions as $$
declare l licenses%rowtype;
begin
  if not cadex.has_any_role(array['admin','gestor_seconser']::user_role[]) then
    raise exception 'Somente Administrador ou Gestor SECONSER pode deferir licença.';
  end if;
  select * into l from licenses where id = p_license_id for update;
  if l.status not in ('em_analise','em_diligencia') then
    raise exception 'Licença não está em análise (situação: %).', l.status;
  end if;

  update licenses
     set status = 'deferida',
         decided_at = now(), decided_by = auth.uid(), decision_note = p_note,
         issued_at = now(), valid_from = current_date, valid_until = p_valid_until,
         license_number = coalesce(l.license_number,
           'LIC-' || to_char(current_date,'YYYY') || '-' ||
           lpad(nextval('license_number_seq')::text, 6, '0'))
   where id = p_license_id
   returning * into l;

  insert into administrative_events (license_id, kind, note, actor_id)
  values (p_license_id, 'deferimento', p_note, auth.uid());
  return l;
end;
$$;

-- ---------------------------------------------------------------------
-- §16–§17 — Autodeclaração de manutenção rotineira
-- ---------------------------------------------------------------------
create sequence declaration_number_seq;

create table declarations (
  id               uuid primary key default uuid_generate_v4(),
  intervention_id  uuid not null unique references interventions(id) on delete cascade,
  declaration_number text unique,
  status           declaration_status not null default 'rascunho',
  registered_at    timestamptz,          -- §16: obrigatoriamente ANTES do deslocamento
  dispatched_at    timestamptz,          -- equipe em deslocamento
  scheduled_start  timestamptz not null,
  scheduled_end    timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_declarations_touch
  before update on declarations
  for each row execute function cadex.touch_updated_at();

-- Roteiro georreferenciado (§16, §17)
create table declaration_routes (
  id              uuid primary key default uuid_generate_v4(),
  declaration_id  uuid not null references declarations(id) on delete cascade,
  sequence        int not null,
  geom            geometry(Geometry, 4326) not null,
  address         text,
  scheduled_at    timestamptz,
  executed_at     timestamptz,
  note            text,
  unique (declaration_id, sequence)
);

create index idx_declaration_routes_geom on declaration_routes using gist (geom);

-- §43 Regra 3: registro obrigatoriamente anterior ao deslocamento.
create or replace function cadex.check_declaration_order()
returns trigger language plpgsql as $$
begin
  if new.status = 'registrada' and new.registered_at is null then
    new.registered_at := now();
  end if;
  if new.dispatched_at is not null then
    if new.registered_at is null then
      raise exception 'Autodeclaração precisa ser registrada antes do deslocamento (§16).';
    end if;
    if new.dispatched_at < new.registered_at then
      raise exception 'Deslocamento (%) anterior ao registro (%) — vedado pelo §16.',
        new.dispatched_at, new.registered_at;
    end if;
  end if;
  if new.status = 'registrada' and new.declaration_number is null then
    new.declaration_number := 'AUT-' || to_char(current_date,'YYYY') || '-' ||
      lpad(nextval('declaration_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_declarations_order
  before insert or update on declarations
  for each row execute function cadex.check_declaration_order();

-- ---------------------------------------------------------------------
-- §18–§19 — Emergências (acionamento CISP 153)
-- ---------------------------------------------------------------------
create table cisp_protocols (
  id             uuid primary key default uuid_generate_v4(),
  protocol_number text not null unique,
  called_at      timestamptz not null,        -- horário do acionamento
  channel        text not null default '153',
  caller_name    text,
  caller_phone   text,
  raw_payload    jsonb,                       -- reservado à futura integração CISP
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

create table emergencies (
  id                uuid primary key default uuid_generate_v4(),
  intervention_id   uuid not null unique references interventions(id) on delete cascade,
  cisp_protocol_id  uuid references cisp_protocols(id),
  status            emergency_status not null default 'acionada',
  risk_nature       text not null,
  dispatched_at     timestamptz,
  arrived_at        timestamptz,
  concluded_at      timestamptz,
  -- §19: prazo de regularização contado do acionamento
  regularization_due_at timestamptz,
  regularized_at    timestamptz,
  on_site_responsible_name  text,
  on_site_responsible_doc   text,
  on_site_responsible_phone text,
  executed_service  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_emergencies_touch
  before update on emergencies
  for each row execute function cadex.touch_updated_at();

create table emergency_photos (
  id            uuid primary key default uuid_generate_v4(),
  emergency_id  uuid not null references emergencies(id) on delete cascade,
  storage_path  text not null,
  caption       text,
  taken_at      timestamptz,
  location      geography(Point, 4326),
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);

-- §19/§43 Regra 5 — prazo de regularização (default 24h, parametrizável).
create or replace function cadex.set_emergency_deadline()
returns trigger language plpgsql as $$
declare v_hours int := coalesce(cadex.param_int('emergency.regularization_hours'), 24);
begin
  if new.regularization_due_at is null and new.cisp_protocol_id is not null then
    new.regularization_due_at :=
      (select called_at from cisp_protocols where id = new.cisp_protocol_id)
      + (v_hours || ' hours')::interval;
  end if;
  return new;
end;
$$;

create trigger trg_emergency_deadline
  before insert or update of cisp_protocol_id on emergencies
  for each row execute function cadex.set_emergency_deadline();

-- Regularização exige protocolo CISP, escopo e imagens (§19).
create or replace function cadex.regularize_emergency(p_emergency_id uuid)
returns emergencies language plpgsql security definer set search_path = public, cadex, extensions as $$
declare e emergencies%rowtype;
begin
  select * into e from emergencies where id = p_emergency_id for update;
  if not found then raise exception 'Emergência não encontrada.'; end if;
  if e.cisp_protocol_id is null then
    raise exception 'Regularização exige protocolo CISP (§18, §19).';
  end if;
  if coalesce(e.executed_service,'') = '' then
    raise exception 'Regularização exige descrição do serviço executado (§19).';
  end if;
  if not exists (select 1 from emergency_photos where emergency_id = p_emergency_id) then
    raise exception 'Regularização exige registro fotográfico (§19).';
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
