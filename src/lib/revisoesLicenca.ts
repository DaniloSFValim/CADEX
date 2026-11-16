import { supabase } from './supabase';
import type { Inconsistencia } from './admin';

/** Um aviso de revisão aceito ("OK, está correto") com o motivo de quem aceitou. */
export interface RevisaoLicenca {
  id: string;
  licenca_id: string;
  aviso: string;
  motivo: string;
  revisado_por: string | null;
  revisado_em: string;
}

export async function listarRevisoes(): Promise<RevisaoLicenca[]> {
  const { data, error } = await supabase.from('licenca_revisoes').select('*').order('revisado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RevisaoLicenca[];
}

export async function aceitarAviso(licencaId: string, aviso: string, motivo: string): Promise<void> {
  const { error } = await supabase.from('licenca_revisoes').insert({ licenca_id: licencaId, aviso, motivo: motivo.trim() });
  if (error) throw error;
}

export async function desfazerRevisao(id: string): Promise<void> {
  const { error } = await supabase.from('licenca_revisoes').delete().eq('id', id);
  if (error) throw error;
}

/** Chave de um aviso aceito. O texto do aviso entra na chave: se o dado mudar, o aviso volta. */
export function chaveRevisao(licencaId: string, aviso: string): string {
  return `${licencaId}|${aviso}`;
}

/** Tira da lista de revisão os avisos já aceitos; a licença sai da lista quando não sobra aviso. */
export function aplicarRevisoes(itens: Inconsistencia[], revisoes: RevisaoLicenca[]): Inconsistencia[] {
  const aceitos = new Set(revisoes.map((r) => chaveRevisao(r.licenca_id, r.aviso)));
  return itens
    .map((i) => ({ ...i, problemas: i.problemas.filter((p) => !aceitos.has(chaveRevisao(i.licenca.id, p))) }))
    .filter((i) => i.problemas.length > 0);
}
