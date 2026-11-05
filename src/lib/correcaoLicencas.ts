import { supabase } from './supabase';

/** Uma correção: o id da licença e os campos novos. Campo vazio fica como está. */
export interface CorrecaoLicenca { id: string; numero?: string; processo_sei?: string }

/** Mesmos padrões que a função do banco confere. */
export const PADRAO_NUMERO_CORRECAO = /^[0-9]{3}\/[0-9]{4}$/;
export const PADRAO_SEI_CORRECAO = /^[0-9]+\/[0-9]{4}$/;

/** Erro legível para uma correção, ou null se estiver no padrão. */
export function erroCorrecao(c: { numero?: string; processo_sei?: string }): string | null {
  const n = c.numero?.trim() ?? '';
  const s = c.processo_sei?.trim() ?? '';
  if (!n && !s) return 'Informe o número ou o processo SEI.';
  if (n && !PADRAO_NUMERO_CORRECAO.test(n)) return 'Número no padrão 000/AAAA.';
  if (s && !PADRAO_SEI_CORRECAO.test(s)) return 'Processo SEI no padrão 000000000/AAAA.';
  return null;
}

/** Aplica o lote no banco. Ou grava tudo, ou nada (a função é atômica). Devolve quantas linhas mudaram. */
export async function corrigirLicencasEmLote(correcoes: CorrecaoLicenca[]): Promise<number> {
  const payload = correcoes.map((c) => ({
    id: c.id,
    ...(c.numero?.trim() ? { numero: c.numero.trim() } : {}),
    ...(c.processo_sei?.trim() ? { processo_sei: c.processo_sei.trim() } : {}),
  }));
  const { data, error } = await supabase.rpc('admin_corrigir_licencas', { p_correcoes: payload });
  if (error) throw error;
  return Number(data ?? 0);
}
