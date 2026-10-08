import { supabase } from './supabase';
import { onlyDigits } from './cnpj';
import type { Setor } from './empresas';

/**
 * Órgão público contratante (SEMOB, uma secretaria, etc.). É só a
 * referência de quem contratou a obra — não se inscreve no CADEX: não tem
 * documentos, validade nem código. Separado de `empresas` de propósito.
 */
export type Esfera = 'municipal' | 'estadual' | 'federal';

export const ESFERA_LABEL: Record<Esfera, string> = {
  municipal: 'Municipal',
  estadual: 'Estadual',
  federal: 'Federal',
};

export const ESFERAS = Object.keys(ESFERA_LABEL) as Esfera[];

export interface Orgao {
  id: string;
  nome: string;
  sigla: string | null;
  esfera: Esfera;
  cnpj: string | null;
  /** Setores em que o órgão contrata. Vazio = sem restrição. */
  setores: Setor[];
  criado_em: string;
  atualizado_em: string;
}

export type OrgaoInput = Pick<Orgao, 'nome' | 'sigla' | 'esfera' | 'cnpj' | 'setores'>;

/** "SEMOB — Secretaria..." quando há sigla; senão só o nome. */
export const nomeOrgao = (o: Pick<Orgao, 'nome' | 'sigla'>) =>
  o.sigla ? `${o.sigla} — ${o.nome}` : o.nome;

export async function listarOrgaos(): Promise<Orgao[]> {
  const { data, error } = await supabase
    .from('orgaos_publicos')
    .select('id, nome, sigla, esfera, cnpj, setores, criado_em, atualizado_em')
    .order('nome');
  if (error) throw error;
  return (data ?? []) as Orgao[];
}

export async function salvarOrgao(input: OrgaoInput, id?: string): Promise<void> {
  const linha = {
    nome: input.nome.trim(),
    sigla: input.sigla?.trim() || null,
    esfera: input.esfera,
    cnpj: input.cnpj ? onlyDigits(input.cnpj) : null,
    setores: input.setores,
  };
  const { error } = id
    ? await supabase.from('orgaos_publicos').update(linha).eq('id', id)
    : await supabase.from('orgaos_publicos').insert(linha);
  if (error) throw error;
}

export async function removerOrgao(id: string): Promise<void> {
  const { error } = await supabase.from('orgaos_publicos').delete().eq('id', id);
  if (error) throw error;
}
