-- =====================================================================
-- CADEX — 04: RLS, views públicas (LGPD) e auditoria (§5, §33, §35, §36)
-- Princípio: negar por padrão. Cada policy declara explicitamente o papel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ativação de RLS em todas as tabelas de domínio
-- ---------------------------------------------------------------------
-- Extensões vivem em `extensions`, não em `public` (ver migration 00).
set search_path = public, extensions;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_roles','system_parameters','holidays','qualifications',
    'companies','company_qualifications','company_representatives',
    'technical_responsibles','document_types','company_documents',
    'company_relationships','administrative_events','intervention_types',
    'interventions','licenses','license_documents','declarations',
    'declaration_routes','cisp_protocols','emergencies','emergency_photos',
    'teams','team_members','vehicles','work_orders','intervention_assignments',
    'inspection_checklist_items','inspections','inspection_items',
    'inspection_photos','as_built','as_built_files','infrastructure_assets',
    'notifications','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Perfis e papéis
-- ---------------------------------------------------------------------
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or cadex.is_staff());

create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and active = true);

create policy profiles_admin_all on profiles for all
  using (cadex.has_role('admin')) with check (cadex.has_role('admin'));

create policy user_roles_read on user_roles for select
  using (user_id = auth.uid() or cadex.has_role('admin'));

create policy user_roles_admin on user_roles for all
  using (cadex.has_role('admin')) with check (cadex.has_role('admin'));

-- ---------------------------------------------------------------------
-- Tabelas de configuração: leitura ampla para autenticados, escrita admin
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'system_parameters','holidays','qualifications','document_types',
    'intervention_types','inspection_checklist_items'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_read', t);
    execute format(
      'create policy %I on %I for all using (cadex.has_role(''admin''))
       with check (cadex.has_role(''admin''))', t || '_admin', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Empresas (§5.6 empresa vê apenas a si própria)
-- ---------------------------------------------------------------------
create policy companies_staff_read on companies for select
  using (cadex.is_staff());

create policy companies_own_read on companies for select
  using (id = cadex.current_company_id());

create policy companies_own_update on companies for update
  using (id = cadex.current_company_id()
         and status in ('rascunho','pendente'))
  with check (id = cadex.current_company_id());

create policy companies_analyst_write on companies for update
  using (cadex.has_any_role(array['admin','gestor_seconser','analista_seconser']::user_role[]))
  with check (cadex.has_any_role(array['admin','gestor_seconser','analista_seconser']::user_role[]));

create policy companies_insert on companies for insert to authenticated
  with check (cadex.has_any_role(array['admin','gestor_seconser']::user_role[])
              or created_by = auth.uid());

-- Tabelas filhas de empresa: mesmo critério, via company_id.
do $$
declare t text;
begin
  foreach t in array array[
    'company_qualifications','company_representatives','technical_responsibles',
    'company_documents','teams','vehicles'
  ] loop
    execute format($f$
      create policy %I on %I for select
        using (cadex.is_staff() or company_id = cadex.current_company_id())
    $f$, t || '_read', t);

    execute format($f$
      create policy %I on %I for all
        using (cadex.has_any_role(array['admin','gestor_seconser','analista_seconser']::user_role[])
               or company_id = cadex.current_company_id())
        with check (cadex.has_any_role(array['admin','gestor_seconser','analista_seconser']::user_role[])
               or company_id = cadex.current_company_id())
    $f$, t || '_write', t);
  end loop;
end $$;

create policy team_members_read on team_members for select
  using (cadex.is_staff()
         or exists (select 1 from teams t where t.id = team_id
                    and t.company_id = cadex.current_company_id()));

create policy team_members_write on team_members for all
  using (cadex.has_role('admin')
         or exists (select 1 from teams t where t.id = team_id
                    and t.company_id = cadex.current_company_id()))
  with check (cadex.has_role('admin')
         or exists (select 1 from teams t where t.id = team_id
                    and t.company_id = cadex.current_company_id()));

create policy company_relationships_read on company_relationships for select
  using (cadex.is_staff()
         or parent_id = cadex.current_company_id()
         or child_id  = cadex.current_company_id());

create policy company_relationships_write on company_relationships for all
  using (cadex.has_any_role(array['admin','gestor_seconser']::user_role[])
         or parent_id = cadex.current_company_id())
  with check (cadex.has_any_role(array['admin','gestor_seconser']::user_role[])
         or parent_id = cadex.current_company_id());

create policy administrative_events_read on administrative_events for select
  using (cadex.is_staff() or company_id = cadex.current_company_id());

create policy administrative_events_write on administrative_events for insert
  with check (cadex.has_any_role(array['admin','gestor_seconser','analista_seconser']::user_role[]));

-- ---------------------------------------------------------------------
-- Intervenções e derivadas
-- ---------------------------------------------------------------------
create or replace function cadex.can_see_intervention(p_id uuid)
returns boolean language sql stable security definer set search_path = public, cadex, extensions as $$
  select cadex.is_staff() or exists (
    select 1 from interventions i
    where i.id = p_id
      and cadex.current_company_id() in
          (i.executor_id, i.subcontractor_id, i.concessionaire_id)
  );
$$;

create policy interventions_read on interventions for select
  using (cadex.is_staff()
         or cadex.current_company_id() in (executor_id, subcontractor_id, concessionaire_id));

create policy interventions_write on interventions for all
  using (cadex.has_any_role(array['admin','gestor_seconser','cisp_seop']::user_role[])
         or cadex.current_company_id() in (executor_id, subcontractor_id))
  with check (cadex.has_any_role(array['admin','gestor_seconser','cisp_seop']::user_role[])
         or cadex.current_company_id() in (executor_id, subcontractor_id));

do $$
declare t text;
begin
  foreach t in array array['licenses','declarations','emergencies','as_built'] loop
    execute format($f$
      create policy %I on %I for select
        using (cadex.can_see_intervention(intervention_id))
    $f$, t || '_read', t);
    execute format($f$
      create policy %I on %I for all
        using (cadex.has_any_role(array['admin','gestor_seconser','analista_seconser','cisp_seop']::user_role[])
               or cadex.can_see_intervention(intervention_id))
        with check (cadex.has_any_role(array['admin','gestor_seconser','analista_seconser','cisp_seop']::user_role[])
               or cadex.can_see_intervention(intervention_id))
    $f$, t || '_write', t);
  end loop;
end $$;

create policy license_documents_rw on license_documents for all
  using (exists (select 1 from licenses l where l.id = license_id
                 and cadex.can_see_intervention(l.intervention_id)))
  with check (exists (select 1 from licenses l where l.id = license_id
                 and cadex.can_see_intervention(l.intervention_id)));

create policy declaration_routes_rw on declaration_routes for all
  using (exists (select 1 from declarations d where d.id = declaration_id
                 and cadex.can_see_intervention(d.intervention_id)))
  with check (exists (select 1 from declarations d where d.id = declaration_id
                 and cadex.can_see_intervention(d.intervention_id)));

create policy emergency_photos_rw on emergency_photos for all
  using (exists (select 1 from emergencies e where e.id = emergency_id
                 and cadex.can_see_intervention(e.intervention_id)))
  with check (exists (select 1 from emergencies e where e.id = emergency_id
                 and cadex.can_see_intervention(e.intervention_id)));

create policy as_built_files_rw on as_built_files for all
  using (exists (select 1 from as_built a where a.id = as_built_id
                 and cadex.can_see_intervention(a.intervention_id)))
  with check (exists (select 1 from as_built a where a.id = as_built_id
                 and cadex.can_see_intervention(a.intervention_id)));

create policy cisp_protocols_read on cisp_protocols for select using (cadex.is_staff());
create policy cisp_protocols_write on cisp_protocols for all
  using (cadex.has_any_role(array['admin','cisp_seop']::user_role[]))
  with check (cadex.has_any_role(array['admin','cisp_seop']::user_role[]));

create policy assignments_rw on intervention_assignments for all
  using (cadex.can_see_intervention(intervention_id))
  with check (cadex.can_see_intervention(intervention_id));

create policy infra_assets_read on infrastructure_assets for select
  using (cadex.is_staff() or company_id = cadex.current_company_id());
create policy infra_assets_write on infrastructure_assets for all
  using (cadex.has_any_role(array['admin','gestor_seconser']::user_role[]))
  with check (cadex.has_any_role(array['admin','gestor_seconser']::user_role[]));

-- ---------------------------------------------------------------------
-- Fiscalização: fiscal e GCM escrevem; empresa lê o que lhe diz respeito
-- ---------------------------------------------------------------------
create policy inspections_read on inspections for select
  using (cadex.is_staff() or company_id = cadex.current_company_id());

create policy inspections_insert on inspections for insert
  with check (cadex.has_any_role(array['admin','fiscal_viario','guarda_civil']::user_role[])
              and inspector_id = auth.uid());

-- Relatório de fiscalização não é editável por terceiros; só o próprio
-- fiscal, e apenas enquanto não encerrado (report_path nulo).
create policy inspections_update_own on inspections for update
  using (inspector_id = auth.uid() and report_path is null)
  with check (inspector_id = auth.uid());

create policy inspection_items_rw on inspection_items for all
  using (exists (select 1 from inspections i where i.id = inspection_id
                 and (i.inspector_id = auth.uid() or cadex.is_staff()
                      or i.company_id = cadex.current_company_id())))
  with check (exists (select 1 from inspections i where i.id = inspection_id
                 and i.inspector_id = auth.uid()));

create policy inspection_photos_rw on inspection_photos for all
  using (exists (select 1 from inspections i where i.id = inspection_id
                 and (i.inspector_id = auth.uid() or cadex.is_staff()
                      or i.company_id = cadex.current_company_id())))
  with check (exists (select 1 from inspections i where i.id = inspection_id
                 and i.inspector_id = auth.uid()));

-- ---------------------------------------------------------------------
-- Notificações e auditoria
-- ---------------------------------------------------------------------
create policy notifications_read on notifications for select
  using (recipient_id = auth.uid()
         or company_id = cadex.current_company_id()
         or cadex.has_role('admin'));

create policy notifications_mark_read on notifications for update
  using (recipient_id = auth.uid() or company_id = cadex.current_company_id())
  with check (recipient_id = auth.uid() or company_id = cadex.current_company_id());

-- §33: log visível apenas a admin/gestor, nunca alterável (trigger em 00).
create policy audit_read on audit_logs for select
  using (cadex.has_any_role(array['admin','gestor_seconser']::user_role[]));

-- ---------------------------------------------------------------------
-- Triggers de auditoria nas entidades sensíveis (§33)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','company_documents','company_relationships','user_roles',
    'licenses','declarations','emergencies','inspections','as_built',
    'work_orders','system_parameters','teams','team_members','vehicles'
  ] loop
    execute format(
      'create trigger trg_audit_%s after insert or update or delete on %I
       for each row execute function cadex.audit_row()', t, t);
  end loop;
end $$;

-- =====================================================================
-- §29, §36 — Camada pública. Minimização de dados: nenhuma view abaixo
-- expõe CPF, telefone, e-mail, fotografia ou documento.
-- =====================================================================

create or replace view public_companies
with (security_invoker = false) as
  select c.cadex_number,
         c.legal_name,
         c.trade_name,
         -- CNPJ é dado de pessoa jurídica e público por natureza; mantido
         -- integralmente por ser o identificador de conferência em campo.
         c.cnpj,
         c.status,
         c.valid_until,
         coalesce(
           (select array_agg(q.name order by q.name)
              from company_qualifications cq
              join qualifications q on q.id = cq.qualification_id
             where cq.company_id = c.id), array[]::text[]) as qualifications
    from companies c
   where c.status in ('ativo','proximo_vencimento');

create or replace view public_interventions
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
          or e.status in ('em_atendimento','regularizada','encerrada','fora_do_prazo'));

comment on view public_interventions is
  '§29/§36 — somente intervenções autorizadas/registradas; sem dados pessoais.';

grant select on public_companies, public_interventions to anon, authenticated;

-- §14/§15 — verificação de autenticidade por QR Code, sem login.
create or replace function public.verify_public_token(p_token text)
returns jsonb language sql stable security definer set search_path = public, cadex, extensions as $$
  select coalesce(
    (select to_jsonb(v) from public_interventions v where v.public_token = p_token),
    jsonb_build_object('found', false)
  );
$$;

grant execute on function public.verify_public_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- GRANTs. RLS só protege o que é acessível: sem grant, o PostgREST
-- devolve erro de permissão; com grant + RLS, devolve apenas as linhas
-- que a policy permite. `anon` não recebe grant em nenhuma tabela.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_roles','system_parameters','holidays','qualifications',
    'companies','company_qualifications','company_representatives',
    'technical_responsibles','document_types','company_documents',
    'company_relationships','administrative_events','intervention_types',
    'interventions','licenses','license_documents','declarations',
    'declaration_routes','cisp_protocols','emergencies','emergency_photos',
    'teams','team_members','vehicles','work_orders','intervention_assignments',
    'inspection_checklist_items','inspections','inspection_items',
    'inspection_photos','as_built','as_built_files','infrastructure_assets',
    'notifications'
  ] loop
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

grant select on audit_logs to authenticated;   -- restrito pela policy a admin/gestor
grant usage on schema public to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- §21 — validação de crachá pelo fiscal. Retorna o mínimo necessário à
-- conferência em campo e exige papel de fiscalização (não é público).
create or replace function public.verify_badge(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, cadex, extensions as $$
declare r jsonb;
begin
  if not cadex.has_any_role(array['admin','fiscal_viario','guarda_civil']::user_role[]) then
    raise exception 'Validação de crachá restrita à fiscalização (§21, §36).';
  end if;
  select jsonb_build_object(
    'full_name', m.full_name,
    'role_title', m.role_title,
    'team', t.name,
    'company', c.legal_name,
    'cadex_number', c.cadex_number,
    'company_active', cadex.is_company_active(c.id),
    'valid_until', m.valid_until,
    'valid', m.active and (m.valid_until is null or m.valid_until >= current_date)
  ) into r
  from team_members m
  join teams t on t.id = m.team_id
  join companies c on c.id = t.company_id
  where m.badge_token = p_token;

  return coalesce(r, jsonb_build_object('found', false));
end;
$$;
