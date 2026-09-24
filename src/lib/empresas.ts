import { BUCKET, supabase } from './supabase';
import { onlyDigits } from './cnpj';

export type Tipo = 'operadora' | 'terceirizada';
export type Situacao = 'ativa' | 'inativa';

export interface Empresa {
  id: string;
  codigo_cadex: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  tipo: Tipo;
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

export type EmpresaInput = Omit<Empresa, 'id' | 'codigo_cadex' | 'criado_em' | 'atualizado_em'>;

/** Terceirizada atendendo uma operadora. Vínculo encerrado tem `fim`. */
export interface Vinculo {
  id: string;
  operadora_id: string;
  terceirizada_id: string;
  inicio: string;
  fim: string | null;
}

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
  };
};

/** Cadastra a empresa e, se for terceirizada, os vínculos com as operadoras. */
export async function criarEmpresa(input: EmpresaInput, operadoras: string[] = []): Promise<string> {
  const { data, error } = await supabase.from('empresas').insert(limpar(input)).select('id').single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  if (input.tipo === 'terceirizada' && operadoras.length > 0) {
    const v = await supabase.from('vinculos')
      .insert(operadoras.map((operadora_id) => ({ operadora_id, terceirizada_id: id })));
    if (v.error) throw v.error;
  }
  return id;
}

export async function salvarEmpresa(id: string, input: EmpresaInput): Promise<void> {
  // CNPJ e tipo não mudam depois do cadastro: o tipo está no código CADEX.
  const { cnpj: _cnpj, tipo: _tipo, ...resto } = limpar(input);
  const { error } = await supabase.from('empresas').update(resto).eq('id', id);
  if (error) throw error;
}

export async function listarVinculos(): Promise<Vinculo[]> {
  const { data, error } = await supabase.from('vinculos').select('*').order('inicio');
  if (error) throw error;
  return data as Vinculo[];
}

export async function criarVinculo(operadoraId: string, terceirizadaId: string): Promise<void> {
  const { error } = await supabase.from('vinculos')
    .insert({ operadora_id: operadoraId, terceirizada_id: terceirizadaId });
  if (error) throw error;
}

/** Encerra (data de hoje) ou reabre um vínculo, sem apagar o histórico. */
export async function definirFimVinculo(id: string, fim: string | null): Promise<void> {
  const { error } = await supabase.from('vinculos').update({ fim }).eq('id', id);
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
