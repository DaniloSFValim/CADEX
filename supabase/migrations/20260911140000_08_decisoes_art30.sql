-- =====================================================================
-- CADEX — 08: decisões administrativas do art. 30
--
-- "Art. 30. Os casos omissos são resolvidos conjuntamente pelos titulares
--  da SECONSER e da SEOP."
--
-- As três resoluções abaixo preenchem omissões apuradas na conferência do
-- articulado. Ficam registradas no próprio banco, e não apenas na
-- documentação, porque alteram o comportamento do sistema e precisam ser
-- auditáveis e reversíveis por ato da mesma autoridade.
-- =====================================================================

-- Extensões vivem em `extensions`, não em `public` (ver migration 00).
set search_path = public, extensions;

create table if not exists normative_decisions (
  id             uuid primary key default uuid_generate_v4(),
  question       text not null,
  decision       text not null,
  rationale      text,
  legal_basis    text not null,
  system_effect  text not null,
  decided_on     date not null default current_date,
  recorded_by    uuid references profiles(id),
  superseded_by  uuid references normative_decisions(id),
  created_at     timestamptz not null default now()
);

comment on table normative_decisions is
  'Art. 30: resoluções de casos omissos pelos titulares da SECONSER e da SEOP.
   Cada linha descreve o efeito concreto sobre o comportamento do sistema.';

alter table normative_decisions enable row level security;
alter table normative_decisions force row level security;

create policy normative_decisions_read on normative_decisions for select
  to authenticated using (true);
create policy normative_decisions_admin on normative_decisions for all
  using (cadex.has_any_role(array['admin','gestor_seconser']::user_role[]))
  with check (cadex.has_any_role(array['admin','gestor_seconser']::user_role[]));

grant select on normative_decisions to authenticated;
grant insert, update, delete on normative_decisions to authenticated;

create trigger trg_audit_normative_decisions
  after insert or update or delete on normative_decisions
  for each row execute function cadex.audit_row();

-- ---------------------------------------------------------------------
-- Decisão 1 — o prazo de análise NÃO se suspende durante a diligência.
-- ---------------------------------------------------------------------
insert into normative_decisions (question, decision, rationale, legal_basis, system_effect)
values (
  'Os prazos de 15 e 20 dias úteis (arts. 7º e 13) suspendem-se durante a diligência?',
  'Não. O prazo corre de forma contínua a partir do protocolo, independentemente '
  'da abertura de diligência.',
  'Os arts. 7º e 13 fixam o prazo sem prever suspensão. A leitura restritiva '
  'preserva a previsibilidade do administrado.',
  'Art. 30, resolvendo omissão dos arts. 7º e 13',
  'analysis_due_date é calculada uma única vez, na passagem a PROTOCOLADO/PROTOCOLADA, '
  'e não é recalculada quando o processo vai a PENDENTE ou EM DILIGÊNCIA.'
) on conflict do nothing;

-- O comportamento decidido já é o implementado. O bloco abaixo o torna
-- explícito e impede regressão silenciosa: qualquer tentativa de zerar ou
-- empurrar o prazo por causa de diligência é revertida.
create or replace function cadex.freeze_analysis_due_date()
returns trigger language plpgsql as $$
begin
  -- Decisão art. 30 (1): o prazo não se suspende nem se reabre por diligência.
  if old.analysis_due_date is not null
     and new.analysis_due_date is distinct from old.analysis_due_date
     and new.protocolled_at is not distinct from old.protocolled_at then
    new.analysis_due_date := old.analysis_due_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_company_freeze_due on companies;
create trigger trg_company_freeze_due
  before update on companies
  for each row execute function cadex.freeze_analysis_due_date();

drop trigger if exists trg_license_freeze_due on licenses;
create trigger trg_license_freeze_due
  before update on licenses
  for each row execute function cadex.freeze_analysis_due_date();

comment on column companies.analysis_due_date is
  'Art. 7º: 15 dias úteis do protocolo. Decisão art. 30 (1): não se suspende '
  'durante diligência.';
comment on column licenses.analysis_due_date is
  'Art. 13: 20 dias úteis do protocolo. Decisão art. 30 (1): não se suspende '
  'durante diligência.';

-- ---------------------------------------------------------------------
-- Decisão 2 — a inaptidão NÃO suspende obra já licenciada.
-- ---------------------------------------------------------------------
insert into normative_decisions (question, decision, rationale, legal_basis, system_effect)
values (
  'A inaptidão da executora suspende obra cuja licença já foi deferida?',
  'Não. A licença deferida permanece válida e a obra em curso prossegue. A '
  'inaptidão impede novos requerimentos e novas vinculações.',
  'O art. 8º, § 2º impede requerer licença e registrar autodeclaração; não '
  'alcança licença já deferida. A suspensão de obra em curso dependeria de ato '
  'próprio, com contraditório.',
  'Art. 30, resolvendo omissão do art. 8º, § 2º',
  'O bloqueio por CADEX inativo incide na criação e na alteração das partes da '
  'intervenção, não na execução de licença já deferida. A situação cadastral '
  'corrente da executora passa a ser exibida ao fiscal e na consulta pública.'
) on conflict do nothing;

comment on function cadex.start_intervention(uuid) is
  'Art. 11: obra não inicia sem licença deferida e vigente. Decisão art. 30 (2): '
  'a inaptidão superveniente da executora não impede o prosseguimento de obra '
  'já licenciada — a verificação aqui é da licença, não da situação cadastral.';

-- Decisão 2 tem contrapartida de transparência: a obra prossegue, mas o
-- fiscal e o cidadão precisam enxergar que a executora está inapta hoje.
-- A situação cadastral é informação de publicação obrigatória (art. 7º, § 2º).
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
         exec.status::text    as executor_cadex_status,
         cadex.is_company_active(exec.id) as executor_cadex_active,
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
          or e.status in ('em_atendimento','regularizada','encerrada','fora_do_prazo'));

comment on view public_interventions is
  'Art. 14: publicidade do canteiro. Art. 7º, § 2º: a situação cadastral corrente
   da executora é publicada, de modo que a decisão art. 30 (2) — obra licenciada
   prossegue apesar da inaptidão superveniente — não fique invisível ao fiscal
   nem ao cidadão.';

grant select on public_interventions to anon, authenticated;

create or replace function public.verify_public_token(p_token text)
returns jsonb language sql stable security definer set search_path = public, cadex, extensions as $$
  select coalesce(
    (select to_jsonb(v) from public_interventions v where v.public_token = p_token),
    jsonb_build_object('found', false)
  );
$$;

create or replace function public.interventions_near(
  p_lng double precision, p_lat double precision, p_radius_m int default 500)
returns setof public_interventions
language sql stable security definer set search_path = public, cadex, extensions as $$
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

-- ---------------------------------------------------------------------
-- Decisão 3 — substituição de poste existente é MANUTENÇÃO ROTINEIRA.
--
-- RESSALVA TÉCNICA REGISTRADA: o critério legal do art. 15 é a atividade
-- NÃO MODIFICAR A ESTRUTURA DA VIA, e o art. 10 classifica como obra a
-- "escavação a céu aberto" e a "implantação de postes". Enquadrar toda
-- substituição como manutenção, sem qualquer condição, abriria via de
-- evasão: bastaria rotular de "substituição" uma implantação que exige
-- nova cava e nova fundação, dispensando a licença do art. 11.
--
-- A decisão foi implementada com um único condicionamento, que decorre
-- do próprio art. 10 e não a contraria: a substituição é manutenção
-- enquanto não houver escavação ou nova fundação. Havendo, a atividade
-- modifica a estrutura da via e recai no art. 10.
--
-- Para afastar o condicionamento, basta remover o trigger
-- cadex.check_maintenance_scope e registrar nova decisão nesta tabela.
-- ---------------------------------------------------------------------
insert into normative_decisions (question, decision, rationale, legal_basis, system_effect)
values (
  'A substituição de poste existente é obra de infraestrutura (art. 10) ou '
  'manutenção rotineira (art. 15)?',
  'Manutenção rotineira, enquanto não implicar escavação a céu aberto ou nova '
  'fundação. Nessas hipóteses, recai no art. 10 e exige licença prévia.',
  'A substituição em cava existente não modifica a estrutura da via, critério do '
  'art. 15. O condicionamento decorre do próprio art. 10, que classifica como '
  'obra a escavação a céu aberto e a implantação de postes, e evita que o '
  'rótulo de "substituição" dispense a licença do art. 11.',
  'Art. 30, resolvendo omissão na fronteira entre os arts. 10 e 15',
  'Novo tipo de intervenção SUBST_POSTE em manutenção, sem exigência de licença. '
  'A coluna interventions.requires_excavation, quando verdadeira, impede o '
  'registro como manutenção e remete ao licenciamento.'
) on conflict do nothing;

insert into intervention_types (kind, code, name, requires_license, legal_basis) values
  ('manutencao','SUBST_POSTE',
   'Substituição de poste existente, sem escavação ou nova fundação', false,
   'Art. 15 c/c decisão art. 30 (3)')
on conflict (code) do update
  set kind = excluded.kind,
      name = excluded.name,
      requires_license = excluded.requires_license,
      legal_basis = excluded.legal_basis;

alter table interventions
  add column if not exists requires_excavation boolean not null default false;

comment on column interventions.requires_excavation is
  'Art. 10: a escavação a céu aberto e a nova fundação caracterizam obra de '
  'infraestrutura. Decisão art. 30 (3): marcada como verdadeira, a atividade '
  'não pode ser registrada como manutenção rotineira.';

create or replace function cadex.check_maintenance_scope()
returns trigger language plpgsql as $$
begin
  if new.kind = 'manutencao' and new.requires_excavation then
    raise exception
      'Atividade com escavação ou nova fundação é obra de infraestrutura (art. 10) '
      'e exige licença prévia (art. 11); não pode ser registrada como manutenção '
      'rotineira (art. 15). Decisão art. 30 (3).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_interventions_maintenance_scope on interventions;
create trigger trg_interventions_maintenance_scope
  before insert or update of kind, requires_excavation on interventions
  for each row execute function cadex.check_maintenance_scope();

-- ---------------------------------------------------------------------
-- Consulta das decisões vigentes, para a tela administrativa.
-- ---------------------------------------------------------------------
create or replace view normative_decisions_current
with (security_invoker = true) as
  select id, question, decision, rationale, legal_basis, system_effect, decided_on
    from normative_decisions
   where superseded_by is null
   order by decided_on, created_at;

grant select on normative_decisions_current to authenticated;
