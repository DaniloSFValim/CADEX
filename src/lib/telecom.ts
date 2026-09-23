/**
 * Área de telecom para a Prefeitura: operadoras, terceirizadas, obras
 * programadas e serviços de rotina.
 *
 * Não há tabela nova. Operadora é empresa com a qualificação `TELECOM` e
 * `is_concessionaire`; terceirizada é empresa ligada a uma operadora por
 * `company_relationships` (subcontratação); obra e serviço de rotina são
 * `interventions` de tipo `obra` e `manutencao`. As regras continuam no
 * banco — CNPJ válido, partes com cadastro ativo, RLS por papel.
 */
import { supabase } from './supabase';

export interface Company {
  id: string;
  cnpj: string;
  legal_name: string;
  trade_name: string | null;
  email: string;
  phone: string | null;
  status: string;
  valid_until: string | null;
}

export interface Link {
  id: string;
  parent_id: string;
  child_id: string;
  active: boolean;
  starts_on: string;
}

export interface Intervention {
  id: string;
  kind: 'obra' | 'manutencao';
  type_id: string | null;
  concessionaire_id: string | null;
  executor_id: string;
  description: string;
  address: string | null;
  district: string | null;
  starts_on: string | null;
  ends_on: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  declarations: {
    id: string;
    status: string;
    declaration_number: string | null;
    scheduled_start: string;
    scheduled_end: string | null;
  }[];
}

export interface InterventionType { id: string; code: string; name: string; kind: string }

const COMPANY_COLS = 'id, cnpj, legal_name, trade_name, email, phone, status, valid_until';

/** Validade inicial da inscrição cadastrada pela Prefeitura: 12 meses (art. 7º, § 1º). */
export function defaultValidUntil(from = new Date()): string {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

async function telecomQualificationId(): Promise<string> {
  const { data, error } = await supabase
    .from('qualifications').select('id').eq('code', 'TELECOM').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------

/** Todas as empresas de telecom (operadoras e terceirizadas), por id. */
export async function loadTelecom(): Promise<{
  companies: Map<string, Company>;
  operators: Company[];
  links: Link[];
}> {
  const tel = await telecomQualificationId();

  const { data: q, error: qe } = await supabase
    .from('company_qualifications').select('company_id').eq('qualification_id', tel);
  if (qe) throw qe;
  const telecomIds = (q ?? []).map((r: { company_id: string }) => r.company_id);

  const { data: ops, error: oe } = await supabase
    .from('companies').select(COMPANY_COLS)
    .eq('is_concessionaire', true)
    .in('id', telecomIds.length ? telecomIds : ['00000000-0000-0000-0000-000000000000'])
    .order('legal_name');
  if (oe) throw oe;
  const operators = (ops ?? []) as Company[];

  const { data: rel, error: re } = await supabase
    .from('company_relationships')
    .select('id, parent_id, child_id, active, starts_on')
    .eq('relation', 'subcontratacao')
    .in('parent_id', operators.length ? operators.map((o) => o.id) : ['00000000-0000-0000-0000-000000000000']);
  if (re) throw re;
  const links = (rel ?? []) as Link[];

  const ids = new Set<string>([...operators.map((o) => o.id), ...links.map((l) => l.child_id)]);
  const { data: all, error: ae } = await supabase
    .from('companies').select(COMPANY_COLS)
    .in('id', ids.size ? [...ids] : ['00000000-0000-0000-0000-000000000000']);
  if (ae) throw ae;

  const companies = new Map<string, Company>();
  for (const c of (all ?? []) as Company[]) companies.set(c.id, c);
  return { companies, operators, links };
}

export async function loadInterventions(
  kind: 'obra' | 'manutencao', operatorIds: string[],
): Promise<Intervention[]> {
  if (operatorIds.length === 0) return [];
  const { data, error } = await supabase
    .from('interventions')
    .select('id, kind, type_id, concessionaire_id, executor_id, description, address, district, '
      + 'starts_on, ends_on, started_at, finished_at, created_at, '
      + 'declarations(id, status, declaration_number, scheduled_start, scheduled_end)')
    .eq('kind', kind)
    .in('concessionaire_id', operatorIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Intervention[];
}

export async function loadTypes(kind: 'obra' | 'manutencao'): Promise<InterventionType[]> {
  const { data, error } = await supabase
    .from('intervention_types').select('id, code, name, kind')
    .eq('kind', kind).eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []) as InterventionType[];
}

// ---------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------

export interface CompanyInput {
  cnpj: string;
  legal_name: string;
  trade_name: string;
  email: string;
  phone: string;
}

const clean = (s: string): string | null => (s.trim() === '' ? null : s.trim());
const digits = (s: string): string => s.replace(/\D/g, '');

/**
 * Cadastra a empresa — ou reaproveita a que já existe com o mesmo CNPJ — e
 * garante a qualificação `TELECOM`. Quem cadastra é a Prefeitura, então a
 * inscrição já nasce ativa por 12 meses.
 */
async function upsertTelecomCompany(input: CompanyInput, concessionaire: boolean): Promise<string> {
  const cnpj = digits(input.cnpj);
  const { data: found, error: fe } = await supabase
    .from('companies').select('id').eq('cnpj', cnpj).maybeSingle();
  if (fe) throw fe;

  let id = (found as { id: string } | null)?.id ?? null;
  if (!id) {
    const { data, error } = await supabase.from('companies').insert({
      cnpj,
      legal_name: input.legal_name.trim(),
      trade_name: clean(input.trade_name),
      email: input.email.trim(),
      phone: clean(input.phone),
      is_concessionaire: concessionaire,
      status: 'ativo',
      valid_from: new Date().toISOString().slice(0, 10),
      valid_until: defaultValidUntil(),
    }).select('id').single();
    if (error) throw error;
    id = (data as { id: string }).id;
  } else if (concessionaire) {
    const { error } = await supabase.from('companies').update({ is_concessionaire: true }).eq('id', id);
    if (error) throw error;
  }

  const tel = await telecomQualificationId();
  const { error: qe } = await supabase.from('company_qualifications')
    .upsert({ company_id: id, qualification_id: tel }, { onConflict: 'company_id,qualification_id', ignoreDuplicates: true });
  if (qe) throw qe;
  return id;
}

export function createOperator(input: CompanyInput): Promise<string> {
  return upsertTelecomCompany(input, true);
}

export async function createSubcontractor(operatorId: string, input: CompanyInput): Promise<void> {
  const childId = await upsertTelecomCompany(input, false);
  if (childId === operatorId) throw new Error('A terceirizada não pode ser a própria operadora.');
  const { error } = await supabase.from('company_relationships').insert({
    parent_id: operatorId, child_id: childId, relation: 'subcontratacao',
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Essa terceirizada já está vinculada a esta operadora.');
    }
    throw error;
  }
}

export async function setLinkActive(linkId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('company_relationships')
    .update({ active, ends_on: active ? null : new Date().toISOString().slice(0, 10) })
    .eq('id', linkId);
  if (error) throw error;
}

export interface InterventionInput {
  kind: 'obra' | 'manutencao';
  type_id: string;
  concessionaire_id: string;
  executor_id: string;
  description: string;
  address: string;
  district: string;
  starts_on: string;
  ends_on: string;
  /** EWKT, já convertido do desenho no mapa. */
  geom: string;
}

export async function createIntervention(input: InterventionInput): Promise<void> {
  const { data, error } = await supabase.from('interventions').insert({
    kind: input.kind,
    type_id: input.type_id,
    concessionaire_id: input.concessionaire_id,
    executor_id: input.executor_id,
    description: input.description.trim(),
    address: clean(input.address),
    district: clean(input.district),
    starts_on: clean(input.starts_on),
    ends_on: clean(input.ends_on),
    geom: input.geom,
  }).select('id').single();
  if (error) throw error;

  if (input.kind === 'manutencao') {
    const id = (data as { id: string }).id;
    const start = new Date(`${input.starts_on}T08:00:00`).toISOString();
    const end = input.ends_on ? new Date(`${input.ends_on}T18:00:00`).toISOString() : null;
    const { error: de } = await supabase.from('declarations').insert({
      intervention_id: id, status: 'registrada', scheduled_start: start, scheduled_end: end,
    });
    if (de) {
      // Sem a declaração o serviço fica incompleto; desfaz a intervenção.
      await supabase.from('interventions').delete().eq('id', id);
      throw de;
    }
  }
}

export async function markObra(id: string, step: 'start' | 'finish'): Promise<void> {
  const patch = step === 'start' ? { started_at: new Date().toISOString() }
    : { finished_at: new Date().toISOString() };
  const { error } = await supabase.from('interventions').update(patch).eq('id', id);
  if (error) throw error;
}

export async function markServico(
  declarationId: string, status: 'em_execucao' | 'encerrada' | 'cancelada',
): Promise<void> {
  const patch: Record<string, string> = { status };
  if (status === 'encerrada' || status === 'cancelada') patch.closed_at = new Date().toISOString();
  const { error } = await supabase.from('declarations').update(patch).eq('id', declarationId);
  if (error) throw error;
}

export async function deleteIntervention(id: string): Promise<void> {
  const { error } = await supabase.from('interventions').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Situação exibida
// ---------------------------------------------------------------------

export type Phase = 'programada' | 'em_andamento' | 'concluida' | 'cancelada';

export const PHASE_LABEL: Record<Phase, string> = {
  programada: 'Programada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

/** Obra: a situação sai das datas reais de início e fim. */
export function obraPhase(i: Pick<Intervention, 'started_at' | 'finished_at'>): Phase {
  if (i.finished_at) return 'concluida';
  if (i.started_at) return 'em_andamento';
  return 'programada';
}

/** Serviço de rotina: a situação é a da declaração. */
export function servicoPhase(status: string | undefined): Phase {
  switch (status) {
    case 'em_execucao':
    case 'equipe_em_deslocamento':
      return 'em_andamento';
    case 'encerrada':
      return 'concluida';
    case 'cancelada':
      return 'cancelada';
    default:
      return 'programada';
  }
}
