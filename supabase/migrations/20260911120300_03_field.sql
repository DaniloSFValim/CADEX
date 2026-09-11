-- =====================================================================
-- CADEX — 03: campo (§20 a §25, §28, §32)
-- Equipes, credenciais, veículos, ordens de serviço, fiscalização,
-- As Built e notificações.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §20–§21 — Equipes, integrantes e credencial digital
-- ---------------------------------------------------------------------
-- Extensões vivem em `extensions`, não em `public` (ver migration 00).
set search_path = public, extensions;

create table teams (
  id             uuid primary key default uuid_generate_v4(),
  company_id     uuid not null references companies(id) on delete cascade,
  code           text not null,
  name           text not null,
  supervisor_name text,
  supervisor_phone text,
  valid_until    date,
  active         boolean not null default true,
  demo           boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, code)
);

create trigger trg_teams_touch before update on teams
  for each row execute function cadex.touch_updated_at();

create table team_members (
  id             uuid primary key default uuid_generate_v4(),
  team_id        uuid not null references teams(id) on delete cascade,
  full_name      text not null,
  document_kind  text not null default 'CPF',
  document_number text not null,
  role_title     text not null,              -- função
  photo_path     text,                       -- Storage privado (§36)
  valid_until    date,
  active         boolean not null default true,
  -- §21: token do crachá digital; opaco e revogável.
  badge_token    text not null unique default encode(gen_random_bytes(16),'hex'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger trg_team_members_touch before update on team_members
  for each row execute function cadex.touch_updated_at();

create index idx_team_members_badge on team_members (badge_token);

-- ---------------------------------------------------------------------
-- §22 — Veículos e máquinas
-- ---------------------------------------------------------------------
create table vehicles (
  id                uuid primary key default uuid_generate_v4(),
  company_id        uuid not null references companies(id) on delete cascade,
  concessionaire_id uuid references companies(id),
  kind              text not null,              -- utilitário, caminhão, retroescavadeira...
  plate             text,
  identification    text,                       -- prefixo/identificação visual
  photo_path        text,
  valid_until       date,
  active            boolean not null default true,
  demo              boolean not null default false,
  qr_token          text not null unique default encode(gen_random_bytes(16),'hex'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index uq_vehicle_plate on vehicles (upper(regexp_replace(plate,'\W','','g')))
  where plate is not null;
create index idx_vehicles_company on vehicles (company_id);

create trigger trg_vehicles_touch before update on vehicles
  for each row execute function cadex.touch_updated_at();

-- ---------------------------------------------------------------------
-- §23 — Ordem de Serviço
-- ---------------------------------------------------------------------
create sequence work_order_number_seq;

create table work_orders (
  id                uuid primary key default uuid_generate_v4(),
  number            text not null unique
                      default 'OS-' || to_char(current_date,'YYYY') || '-' ||
                              lpad(nextval('work_order_number_seq')::text, 6, '0'),
  intervention_id   uuid references interventions(id) on delete cascade,
  executor_id       uuid not null references companies(id),
  subcontractor_id  uuid references companies(id),
  concessionaire_id uuid references companies(id),
  team_id           uuid references teams(id),
  vehicle_id        uuid references vehicles(id),
  responsible_name  text,
  -- §23: em emergência o endereço pode não estar previamente definido.
  address           text,
  segment           text,
  description       text not null,
  issued_on         date not null default current_date,
  status            text not null default 'aberta'
                      check (status in ('aberta','em_execucao','concluida','cancelada')),
  pdf_path          text,
  qr_token          text not null unique default encode(gen_random_bytes(16),'hex'),
  demo              boolean not null default false,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_work_orders_touch before update on work_orders
  for each row execute function cadex.touch_updated_at();

-- Endereço é exigível salvo em OS de emergência (§23).
create or replace function cadex.check_work_order_address()
returns trigger language plpgsql as $$
declare v_kind intervention_kind;
begin
  select kind into v_kind from interventions where id = new.intervention_id;
  if coalesce(new.address,'') = '' and coalesce(v_kind::text,'') <> 'emergencia' then
    raise exception 'Ordem de serviço não emergencial exige endereço (§23).';
  end if;
  return new;
end;
$$;

create trigger trg_work_order_address
  before insert or update on work_orders
  for each row execute function cadex.check_work_order_address();

-- Vínculo N:N entre equipes/veículos e intervenções (§20, §22).
create table intervention_assignments (
  id              uuid primary key default uuid_generate_v4(),
  intervention_id uuid not null references interventions(id) on delete cascade,
  team_id         uuid references teams(id) on delete cascade,
  vehicle_id      uuid references vehicles(id) on delete cascade,
  assigned_at     timestamptz not null default now(),
  released_at     timestamptz,
  check (team_id is not null or vehicle_id is not null)
);

-- ---------------------------------------------------------------------
-- §24–§25 — Fiscalização em campo
-- ---------------------------------------------------------------------
create table inspection_checklist_items (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,
  label       text not null,
  -- Item pode ser restrito a um tipo de intervenção; NULL = sempre aplicável.
  applies_to  intervention_kind,
  sort_order  int not null default 0,
  active      boolean not null default true
);

create sequence inspection_number_seq;

create table inspections (
  id               uuid primary key default uuid_generate_v4(),
  number           text not null unique
                     default 'FIS-' || to_char(current_date,'YYYY') || '-' ||
                             lpad(nextval('inspection_number_seq')::text, 6, '0'),
  intervention_id  uuid references interventions(id) on delete set null,
  work_order_id    uuid references work_orders(id) on delete set null,
  company_id       uuid references companies(id),
  inspector_id     uuid not null references profiles(id),
  inspected_at     timestamptz not null default now(),
  location         geography(Point, 4326),     -- GPS do fiscal (§25)
  location_accuracy_m numeric(8,2),
  address          text,
  result           inspection_result not null default 'conforme',
  irregularity     boolean not null default false,
  findings         text,
  report_path      text,
  demo             boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_inspections_geom on inspections using gist (location);
create index idx_inspections_company on inspections (company_id, inspected_at desc);

create trigger trg_inspections_touch before update on inspections
  for each row execute function cadex.touch_updated_at();

create table inspection_items (
  id            uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  item_id       uuid not null references inspection_checklist_items(id),
  result        inspection_result not null,
  note          text,
  unique (inspection_id, item_id)
);

create table inspection_photos (
  id            uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  storage_path  text not null,
  caption       text,
  taken_at      timestamptz,
  location      geography(Point, 4326),
  created_at    timestamptz not null default now()
);

-- Marca irregularidade automaticamente se qualquer item for não conforme.
create or replace function cadex.sync_inspection_result()
returns trigger language plpgsql as $$
declare v_insp uuid := coalesce(new.inspection_id, old.inspection_id);
begin
  update inspections i
     set irregularity = exists (
           select 1 from inspection_items x
           where x.inspection_id = v_insp and x.result = 'nao_conforme'),
         result = case when exists (
           select 1 from inspection_items x
           where x.inspection_id = v_insp and x.result = 'nao_conforme')
           then 'nao_conforme'::inspection_result else 'conforme'::inspection_result end
   where i.id = v_insp;
  return coalesce(new, old);
end;
$$;

create trigger trg_inspection_items_sync
  after insert or update or delete on inspection_items
  for each row execute function cadex.sync_inspection_result();

-- ---------------------------------------------------------------------
-- §28 — As Built
-- ---------------------------------------------------------------------
create table as_built (
  id               uuid primary key default uuid_generate_v4(),
  intervention_id  uuid not null references interventions(id) on delete cascade,
  license_id       uuid references licenses(id) on delete set null,
  company_id       uuid not null references companies(id),
  technical_responsible_id uuid references technical_responsibles(id),
  status           as_built_status not null default 'solicitado',
  requested_at     timestamptz not null default now(),
  submitted_at     timestamptz,
  validated_at     timestamptz,
  validated_by     uuid references profiles(id),
  rejection_reason text,
  -- Geometria executada, com profundidade/altura (§28)
  geom             geometry(Geometry, 4326),
  depth_m          numeric(8,2),
  height_m         numeric(8,2),
  executed_on      date,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_as_built_geom on as_built using gist (geom);

create trigger trg_as_built_touch before update on as_built
  for each row execute function cadex.touch_updated_at();

create table as_built_files (
  id           uuid primary key default uuid_generate_v4(),
  as_built_id  uuid not null references as_built(id) on delete cascade,
  format       text not null check (format in ('geojson','kml','kmz','shapefile','dwg','dxf','pdf')),
  storage_path text not null,
  file_name    text not null,
  file_size    bigint not null,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- Arquivo histórico consolidado da infraestrutura (§28, §53)
create table infrastructure_assets (
  id               uuid primary key default uuid_generate_v4(),
  company_id       uuid references companies(id),
  as_built_id      uuid references as_built(id) on delete set null,
  asset_kind       text not null,          -- duto, poste, rede aérea, caixa...
  geom             geometry(Geometry, 4326) not null,
  depth_m          numeric(8,2),
  height_m         numeric(8,2),
  installed_on     date,
  attributes       jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index idx_infra_assets_geom on infrastructure_assets using gist (geom);

-- ---------------------------------------------------------------------
-- §32 — Notificações
-- ---------------------------------------------------------------------
create table notifications (
  id           uuid primary key default uuid_generate_v4(),
  recipient_id uuid references profiles(id) on delete cascade,
  company_id   uuid references companies(id) on delete cascade,
  category     text not null,          -- documento_vencendo, cadex_vencendo, ...
  severity     text not null default 'info' check (severity in ('info','warning','critical')),
  title        text not null,
  body         text,
  entity       text,
  entity_id    text,
  -- Chave de deduplicação: o motor de prazos roda periodicamente e não pode
  -- reemitir a mesma notificação a cada execução.
  dedupe_key   text unique,
  read_at      timestamptz,
  -- Canais: 'internal' já funciona; 'email'/'whatsapp' dependem de
  -- credenciais externas (ver ENVIRONMENT.md).
  channels     text[] not null default array['internal'],
  dispatched_at timestamptz,
  created_at   timestamptz not null default now()
);

create index idx_notifications_recipient on notifications (recipient_id, read_at, created_at desc);
create index idx_notifications_company on notifications (company_id, created_at desc);
