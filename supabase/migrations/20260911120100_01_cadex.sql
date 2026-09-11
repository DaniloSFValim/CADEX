-- =====================================================================
-- CADEX — 01: empresas, qualificações, documentos, responsáveis,
--             subcontratação e processo administrativo (§6 a §11)
-- =====================================================================

-- ---------------------------------------------------------------------
-- §6 — Qualificações configuráveis (NÃO enum: a Resolução admite novas)
-- ---------------------------------------------------------------------
create table qualifications (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,
  name        text not null,
  description text,
  -- Se true, a qualificação habilita a empresa a executar intervenção
  -- sujeita a licenciamento (§43 Regra 1).
  enables_execution boolean not null default true,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- §6 — Empresas (executoras, subcontratadas, concessionárias, etc.)
-- ---------------------------------------------------------------------
create table companies (
  id                uuid primary key default uuid_generate_v4(),
  cnpj              text not null unique
                      check (cadex.is_valid_cnpj(cnpj)),
  legal_name        text not null,               -- razão social
  trade_name        text,                        -- nome fantasia
  -- endereço
  zip_code          text,
  street            text,
  number            text,
  complement        text,
  district          text,
  city              text,
  state             char(2),
  location          geography(Point, 4326),      -- sede, opcional
  -- contatos
  email             text not null,
  phone             text,
  website           text,

  -- §11: uma concessionária é uma empresa como outra qualquer; o que muda
  -- é o PAPEL que ela assume numa intervenção. A flag apenas facilita
  -- filtros; o papel real fica em `interventions`.
  is_concessionaire boolean not null default false,

  -- Situação CADEX (§9)
  cadex_number      text unique,                 -- gerado no deferimento
  status            cadex_status not null default 'rascunho',
  protocol_number   text unique,
  protocolled_at    timestamptz,
  analysis_due_date date,                        -- §31: 15 dias úteis
  approved_at       timestamptz,
  valid_from        date,
  valid_until       date,                        -- §8: 12 meses
  inapt_at          timestamptz,
  remediation_due_date date,                     -- §31: 30 dias de saneamento
  rejection_reason  text,

  demo              boolean not null default false,  -- §46
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_companies_status on companies (status);
create index idx_companies_valid_until on companies (valid_until);
create index idx_companies_name_trgm on companies using gin (legal_name gin_trgm_ops);
create index idx_companies_cadex on companies (cadex_number);

create trigger trg_companies_touch
  before update on companies
  for each row execute function cadex.touch_updated_at();

alter table profiles
  add constraint fk_profiles_company
  foreign key (company_id) references companies(id) on delete set null;

-- §6 — múltiplas qualificações por empresa (N:N, não campo único)
create table company_qualifications (
  company_id       uuid not null references companies(id) on delete cascade,
  qualification_id uuid not null references qualifications(id) on delete restrict,
  granted_at       timestamptz not null default now(),
  primary key (company_id, qualification_id)
);

-- ---------------------------------------------------------------------
-- §6 — Responsáveis legais e técnicos
-- ---------------------------------------------------------------------
create table company_representatives (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references companies(id) on delete cascade,
  kind        text not null check (kind in ('legal','procurador','administrador')),
  full_name   text not null,
  cpf         text not null,
  email       text,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table technical_responsibles (
  id                uuid primary key default uuid_generate_v4(),
  company_id        uuid not null references companies(id) on delete cascade,
  full_name         text not null,
  cpf               text not null,
  professional_body text not null,          -- CREA, CAU, CFT...
  registration_no   text not null,          -- número de registro
  registration_uf   char(2),
  art_rrt_number    text,                   -- ART/RRT de cargo ou função (§7)
  art_rrt_valid_until date,
  email             text,
  phone             text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (company_id, professional_body, registration_no)
);

-- ---------------------------------------------------------------------
-- §7 — Tipos de documento e documentos com controle de validade
-- ---------------------------------------------------------------------
create table document_types (
  id            uuid primary key default uuid_generate_v4(),
  code          text not null unique,
  name          text not null,
  category      text not null
                  check (category in ('juridico_fiscal','tecnico','outros')),
  required      boolean not null default true,
  has_expiry    boolean not null default true,
  -- Se a qualificação for NULL o documento vale para todas as empresas.
  qualification_id uuid references qualifications(id) on delete set null,
  legal_basis   text,
  active        boolean not null default true,
  sort_order    int not null default 0
);

create table company_documents (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references companies(id) on delete cascade,
  document_type_id uuid not null references document_types(id) on delete restrict,
  version         int not null default 1,
  number          text,
  issuer          text,                      -- órgão emissor
  issued_at       date,
  valid_until     date,
  status          document_status not null default 'em_analise',
  storage_path    text not null,             -- Supabase Storage (bucket privado)
  file_name       text not null,
  file_size       bigint not null,
  mime_type       text not null,
  note            text,
  reviewed_by     uuid references profiles(id),
  reviewed_at     timestamptz,
  rejection_reason text,
  superseded_by   uuid references company_documents(id) on delete set null,
  uploaded_by     uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_company_documents_company on company_documents (company_id, status);
create index idx_company_documents_validity on company_documents (valid_until)
  where status = 'aprovado';

create trigger trg_company_documents_touch
  before update on company_documents
  for each row execute function cadex.touch_updated_at();

-- Apenas uma versão vigente por (empresa, tipo).
create unique index uq_current_document
  on company_documents (company_id, document_type_id)
  where status in ('em_analise','aprovado','vencido');

-- ---------------------------------------------------------------------
-- §10 — Cadeia de subcontratação, profundidade NÃO limitada
-- ---------------------------------------------------------------------
create table company_relationships (
  id             uuid primary key default uuid_generate_v4(),
  parent_id      uuid not null references companies(id) on delete cascade,
  child_id       uuid not null references companies(id) on delete cascade,
  relation       text not null
                   check (relation in ('subcontratacao','contrato_concessao',
                                       'compartilhamento_infraestrutura')),
  contract_ref   text,
  starts_on      date not null default current_date,
  ends_on        date,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  check (parent_id <> child_id),
  unique (parent_id, child_id, relation, starts_on)
);

create index idx_company_rel_parent on company_relationships (parent_id) where active;
create index idx_company_rel_child  on company_relationships (child_id)  where active;

-- Impede ciclo A→B→A em qualquer profundidade.
create or replace function cadex.check_relationship_cycle()
returns trigger language plpgsql as $$
begin
  if exists (
    with recursive chain as (
      select new.parent_id as id, 1 as depth
      union all
      select r.parent_id, c.depth + 1
      from company_relationships r
      join chain c on r.child_id = c.id
      where r.active and c.depth < 50
    )
    select 1 from chain where id = new.child_id
  ) then
    raise exception 'Ciclo na cadeia de subcontratação: % já é ascendente de %',
      new.child_id, new.parent_id;
  end if;
  return new;
end;
$$;

create trigger trg_company_rel_cycle
  before insert or update on company_relationships
  for each row when (new.active) execute function cadex.check_relationship_cycle();

-- Cadeia completa a partir de uma empresa (usada em telas e validações).
create or replace function cadex.subcontracting_chain(p_company_id uuid)
returns table (company_id uuid, depth int, path uuid[])
language sql stable as $$
  with recursive chain as (
    select p_company_id as company_id, 0 as depth, array[p_company_id] as path
    union all
    select r.child_id, c.depth + 1, c.path || r.child_id
    from company_relationships r
    join chain c on r.parent_id = c.company_id
    where r.active and r.relation = 'subcontratacao'
      and not r.child_id = any(c.path)
      and c.depth < 50
  )
  select * from chain where depth > 0;
$$;

-- ---------------------------------------------------------------------
-- §8, §9 — Motor de situação cadastral
-- ---------------------------------------------------------------------

-- §43 Regra 1/6/8: CADEX ativo é pré-condição de qualquer habilitação.
create or replace function cadex.is_company_active(p_company_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from companies c
    where c.id = p_company_id
      and c.status in ('ativo','proximo_vencimento')
      and c.valid_until >= current_date
  );
$$;

-- Recalcula status derivado. Não sobrepõe decisões administrativas
-- (indeferido / cancelado / em análise permanecem intactos).
create or replace function cadex.refresh_company_status(p_company_id uuid)
returns cadex_status language plpgsql as $$
declare
  c companies%rowtype;
  v_expired_docs int;
  v_warn_days int := coalesce(cadex.param_int('cadex.warning_days'), 30);
  v_new cadex_status;
begin
  select * into c from companies where id = p_company_id for update;
  if not found then return null; end if;

  -- Situações puramente administrativas não são recalculadas: elas
  -- dependem de decisão humana, não de vencimento de documento.
  if c.status in ('rascunho','protocolado','em_analise','indeferido','cancelado') then
    return c.status;
  end if;

  -- Documentos aprovados que venceram
  update company_documents
     set status = 'vencido'
   where company_id = p_company_id
     and status = 'aprovado'
     and valid_until is not null
     and valid_until < current_date;

  select count(*) into v_expired_docs
    from company_documents
   where company_id = p_company_id and status = 'vencido';

  -- PENDENTE aberto por diligência administrativa (sem pendência
  -- documental) só sai desse estado por decisão do analista.
  if c.status = 'pendente' and v_expired_docs = 0 and c.remediation_due_date is null then
    return c.status;
  end if;

  if c.valid_until is null or c.valid_until < current_date then
    v_new := 'inapto';
  elsif v_expired_docs > 0 then
    -- §9: documento vencido abre prazo de saneamento; só depois vira INAPTA.
    if c.remediation_due_date is null then
      update companies
         set remediation_due_date = current_date
           + coalesce(cadex.param_int('cadex.remediation_days'), 30)
       where id = p_company_id;
      v_new := 'pendente';
    elsif c.remediation_due_date < current_date then
      v_new := 'inapto';
    else
      v_new := 'pendente';
    end if;
  elsif c.valid_until <= current_date + v_warn_days then
    v_new := 'proximo_vencimento';
  else
    v_new := 'ativo';
  end if;

  if v_new <> c.status then
    update companies
       set status = v_new,
           inapt_at = case when v_new = 'inapto' then now() else inapt_at end
     where id = p_company_id;
  end if;

  return v_new;
end;
$$;

-- Geração do número CADEX no deferimento. Sequencial por ano.
create sequence cadex_number_seq;

create or replace function cadex.approve_company(p_company_id uuid, p_note text default null)
returns companies language plpgsql security definer set search_path = public, cadex as $$
declare
  c companies%rowtype;
  v_months int := coalesce(cadex.param_int('cadex.validity_months'), 12);
begin
  if not cadex.has_any_role(array['admin','gestor_seconser']::user_role[]) then
    raise exception 'Somente Administrador ou Gestor SECONSER pode deferir (§5).';
  end if;

  select * into c from companies where id = p_company_id for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  if c.status not in ('em_analise','pendente','deferido') then
    raise exception 'Deferimento exige processo em análise (situação atual: %).', c.status;
  end if;
  if exists (select 1 from company_documents d
              where d.company_id = p_company_id
                and d.status in ('pendente_envio','rejeitado','vencido')) then
    raise exception 'Há documentos pendentes, rejeitados ou vencidos (§8).';
  end if;

  update companies
     set status       = 'ativo',
         approved_at  = now(),
         valid_from   = current_date,
         valid_until  = (current_date + (v_months || ' months')::interval)::date,
         cadex_number = coalesce(
           c.cadex_number,
           to_char(current_date,'YYYY') || '-' ||
           lpad(nextval('cadex_number_seq')::text, 6, '0')),
         remediation_due_date = null,
         rejection_reason = null
   where id = p_company_id
   returning * into c;

  insert into administrative_events (company_id, kind, note, actor_id)
  values (p_company_id, 'deferimento', p_note, auth.uid());

  return c;
end;
$$;

-- ---------------------------------------------------------------------
-- §4/§33 — Trilha do processo administrativo
-- ---------------------------------------------------------------------
create table administrative_events (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid references companies(id) on delete cascade,
  license_id   uuid,     -- FK em 02
  kind         process_event_kind not null,
  note         text,
  due_date     date,
  actor_id     uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index idx_admin_events_company on administrative_events (company_id, created_at desc);
