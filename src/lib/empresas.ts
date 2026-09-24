import { BUCKET, supabase } from './supabase';
import { onlyDigits } from './cnpj';

export type Tipo = 'operadora' | 'terceirizada';
export type Situacao = 'ativa' | 'inativa';

export interface Empresa {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  tipo: Tipo;
  operadora_id: string | null;
  email: string;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  situacao: Situacao;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type EmpresaInput = Omit<Empresa, 'id' | 'criado_em' | 'atualizado_em'>;

export interface TipoDocumento {
  codigo: string;
  nome: string;
  fundamento: string;
  obrigatorio: boolean;
  tem_validade: boolean;
  ordem: number;
}

export interface Documento {
  id: string;
  empresa_id: string;
  tipo: string;
  arquivo: string;
  nome_arquivo: string;
  validade: string | null;
  enviado_em: string;
}

export const TIPO_LABEL: Record<Tipo, string> = {
  operadora: 'Operadora',
  terceirizada: 'Terceirizada',
};

export const nomeEmpresa = (e: Pick<Empresa, 'razao_social' | 'nome_fantasia'>) =>
  e.nome_fantasia?.trim() || e.razao_social;

// ---------------------------------------------------------------------
// Situação de cada documento
// ---------------------------------------------------------------------

/** Antecedência do aviso de vencimento. */
export const DIAS_AVISO = 30;

export type EstadoDocumento = 'pendente' | 'ok' | 'vence_em_breve' | 'vencido';

export const ESTADO_LABEL: Record<EstadoDocumento, string> = {
  pendente: 'Pendente',
  ok: 'Em dia',
  vence_em_breve: 'Vence em breve',
  vencido: 'Vencido',
};

/** Datas `YYYY-MM-DD` comparadas como texto: sem fuso horário no meio. */
export function estadoDocumento(
  tipo: Pick<TipoDocumento, 'tem_validade'>,
  doc: Pick<Documento, 'validade'> | undefined,
  hoje: string,
): EstadoDocumento {
  if (!doc) return 'pendente';
  if (!tipo.tem_validade || !doc.validade) return 'ok';
  if (doc.validade < hoje) return 'vencido';
  return doc.validade <= somaDias(hoje, DIAS_AVISO) ? 'vence_em_breve' : 'ok';
}

export function hojeISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function somaDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return hojeISO(new Date(y, m - 1, d + dias));
}

/** O documento vigente de cada tipo é o último enviado. */
export function ultimoPorTipo(docs: Documento[]): Map<string, Documento> {
  const m = new Map<string, Documento>();
  for (const d of docs) {
    const atual = m.get(d.tipo);
    if (!atual || d.enviado_em > atual.enviado_em) m.set(d.tipo, d);
  }
  return m;
}

export interface Resumo { faltando: number; vencidos: number; vencendo: number }

/** Quantos obrigatórios faltam e quantos documentos estão vencidos ou vencendo. */
export function resumoDocumentos(
  tipos: TipoDocumento[], docs: Documento[], hoje: string,
): Resumo {
  const ultimos = ultimoPorTipo(docs);
  const r: Resumo = { faltando: 0, vencidos: 0, vencendo: 0 };
  for (const t of tipos) {
    const e = estadoDocumento(t, ultimos.get(t.codigo), hoje);
    if (e === 'pendente' && t.obrigatorio) r.faltando++;
    if (e === 'vencido') r.vencidos++;
    if (e === 'vence_em_breve') r.vencendo++;
  }
  return r;
}

// ---------------------------------------------------------------------
// Acesso ao banco
// ---------------------------------------------------------------------

export async function listarEmpresas(): Promise<Empresa[]> {
  const { data, error } = await supabase.from('empresas').select('*').order('razao_social');
  if (error) throw error;
  return data as Empresa[];
}

export async function buscarEmpresa(id: string): Promise<Empresa> {
  const { data, error } = await supabase.from('empresas').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Empresa;
}

const limpar = (input: EmpresaInput) => {
  const vazioViraNulo = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    ...input,
    cnpj: onlyDigits(input.cnpj),
    razao_social: input.razao_social.trim(),
    email: input.email.trim(),
    nome_fantasia: vazioViraNulo(input.nome_fantasia),
    telefone: vazioViraNulo(input.telefone),
    cep: vazioViraNulo(input.cep),
    logradouro: vazioViraNulo(input.logradouro),
    numero: vazioViraNulo(input.numero),
    complemento: vazioViraNulo(input.complemento),
    bairro: vazioViraNulo(input.bairro),
    cidade: vazioViraNulo(input.cidade),
    uf: vazioViraNulo(input.uf)?.toUpperCase() ?? null,
    observacoes: vazioViraNulo(input.observacoes),
    operadora_id: input.tipo === 'terceirizada' ? input.operadora_id : null,
  };
};

export async function criarEmpresa(input: EmpresaInput): Promise<string> {
  const { data, error } = await supabase.from('empresas').insert(limpar(input)).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function salvarEmpresa(id: string, input: EmpresaInput): Promise<void> {
  // O CNPJ é a identidade da empresa: não muda depois do cadastro.
  const { cnpj: _cnpj, ...resto } = limpar(input);
  const { error } = await supabase.from('empresas').update(resto).eq('id', id);
  if (error) throw error;
}

export async function listarTiposDocumento(): Promise<TipoDocumento[]> {
  const { data, error } = await supabase.from('tipos_documento').select('*').order('ordem');
  if (error) throw error;
  return data as TipoDocumento[];
}

export async function listarDocumentos(empresaId?: string): Promise<Documento[]> {
  let q = supabase.from('documentos').select('*').order('enviado_em', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) throw error;
  return data as Documento[];
}

export async function enviarDocumento(
  empresaId: string, tipo: string, arquivo: File, validade: string | null,
): Promise<void> {
  const nomeSeguro = arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
  const caminho = `${empresaId}/${tipo}-${Date.now()}-${nomeSeguro}`;
  const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type || undefined,
  });
  if (up.error) throw up.error;

  const { error } = await supabase.from('documentos').insert({
    empresa_id: empresaId, tipo, arquivo: caminho, nome_arquivo: arquivo.name, validade,
  });
  if (error) {
    // Sem o registro, o arquivo ficaria órfão no Storage.
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw error;
  }
}

export async function removerDocumento(doc: Documento): Promise<void> {
  const { error } = await supabase.from('documentos').delete().eq('id', doc.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([doc.arquivo]);
}

export async function linkDocumento(doc: Documento): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.arquivo, 120);
  if (error) throw error;
  return data.signedUrl;
}
