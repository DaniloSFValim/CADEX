import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Leitura da auditoria (só o gestor lê; ninguém grava por aqui: os
// gatilhos do banco registram e o registro não se altera nem se apaga).
// ---------------------------------------------------------------------

export type OperacaoAuditoria = 'INSERT' | 'UPDATE' | 'DELETE';

export interface EventoAuditoria {
  id: number;
  em: string;
  /** Vazio: alteração feita direto no banco, sem usuário. */
  por: string | null;
  por_nome: string | null;
  tabela: string;
  registro_id: string | null;
  empresas: string[];
  operacao: OperacaoAuditoria;
  /** Na alteração, só os campos que mudaram. */
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}

export const OPERACAO_LABEL: Record<OperacaoAuditoria, string> = {
  INSERT: 'Inclusão', UPDATE: 'Alteração', DELETE: 'Exclusão',
};

export const TABELA_AUDITORIA_LABEL: Record<string, string> = {
  servidores: 'Contas e acessos',
  empresas: 'Empresas',
  licencas: 'Licenças',
  licenca_trechos: 'Trechos de licença',
  vinculos: 'Vínculos entre empresas',
  documentos: 'Documentos',
  responsaveis_tecnicos: 'Responsáveis técnicos',
  funcionarios: 'Funcionários',
  veiculos: 'Veículos',
  orgaos_publicos: 'Órgãos públicos',
};

export const nomeTabela = (t: string) => TABELA_AUDITORIA_LABEL[t] ?? t;

export interface FiltroAuditoria {
  tabela: string;
  operacao: OperacaoAuditoria | '';
  de: string;
  ate: string;
  /** Id do registro (uma licença, uma empresa, uma conta). */
  registro: string;
  /** Parte do nome de quem fez. */
  quem: string;
}

export const FILTRO_AUDITORIA_VAZIO: FiltroAuditoria = { tabela: '', operacao: '', de: '', ate: '', registro: '', quem: '' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const registroValido = (s: string) => s === '' || UUID.test(s.trim());

/** Protege os curingas do `ilike` para a busca por nome ser literal. */
const literal = (s: string) => s.trim().replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listarAuditoria(
  f: FiltroAuditoria, desde: number, tamanho = 50,
): Promise<{ eventos: EventoAuditoria[]; total: number }> {
  let q = supabase.from('auditoria').select('*', { count: 'exact' })
    .order('em', { ascending: false }).order('id', { ascending: false });
  if (f.tabela) q = q.eq('tabela', f.tabela);
  if (f.operacao) q = q.eq('operacao', f.operacao);
  if (f.de) q = q.gte('em', new Date(`${f.de}T00:00:00`).toISOString());
  if (f.ate) q = q.lte('em', new Date(`${f.ate}T23:59:59.999`).toISOString());
  if (f.registro.trim()) {
    if (!registroValido(f.registro)) throw new Error('O código do registro não é válido.');
    q = q.eq('registro_id', f.registro.trim());
  }
  if (f.quem.trim()) q = q.ilike('por_nome', `%${literal(f.quem)}%`);
  const { data, error, count } = await q.range(desde, desde + tamanho - 1);
  if (error) throw error;
  return { eventos: (data ?? []) as EventoAuditoria[], total: count ?? 0 };
}

export interface CampoAlterado { campo: string; antes: unknown; depois: unknown }

/** Os campos de um evento: na alteração, antes e depois; na inclusão e na exclusão, os preenchidos. */
export function camposDoEvento(e: Pick<EventoAuditoria, 'operacao' | 'antes' | 'depois'>): CampoAlterado[] {
  if (e.operacao === 'UPDATE') {
    const chaves = new Set([...Object.keys(e.antes ?? {}), ...Object.keys(e.depois ?? {})]);
    return [...chaves].sort().map((campo) => ({ campo, antes: e.antes?.[campo] ?? null, depois: e.depois?.[campo] ?? null }));
  }
  const base = (e.operacao === 'INSERT' ? e.depois : e.antes) ?? {};
  return Object.keys(base).sort()
    .filter((campo) => base[campo] !== null && base[campo] !== '')
    .map((campo) => ({
      campo,
      antes: e.operacao === 'DELETE' ? base[campo] : null,
      depois: e.operacao === 'INSERT' ? base[campo] : null,
    }));
}

/** Uma frase para a lista: o que o evento fez. */
export function resumoEvento(e: Pick<EventoAuditoria, 'operacao' | 'antes' | 'depois'>): string {
  if (e.operacao === 'INSERT') return 'Incluiu o registro';
  if (e.operacao === 'DELETE') return 'Excluiu o registro';
  const campos = camposDoEvento(e).map((c) => c.campo);
  const lista = campos.slice(0, 4).join(', ');
  return campos.length === 0 ? 'Alterou o registro' : `Alterou: ${lista}${campos.length > 4 ? ` e mais ${campos.length - 4}` : ''}`;
}

/** Valor de um campo para mostrar na tela, sem mexer em HTML (o React já escapa). */
export function valorParaTela(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'vazio';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return JSON.stringify(v);
}
