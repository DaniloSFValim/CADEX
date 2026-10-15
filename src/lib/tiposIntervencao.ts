import { supabase } from './supabase';
import { SETOR_LABEL, SETORES, type Setor } from './empresas';

/**
 * Catálogo de tipos de obra e serviço por setor. Mantido pela administração.
 * O banco é quem decide de fato (código imutável, telecom fechado no art. 10,
 * "outros" fixo); aqui só se valida o que a tela envia, para avisar cedo.
 */
export interface TipoIntervencao {
  id: string;
  setor: Setor;
  codigo: string;
  rotulo: string;
  fonte: string;
  ativo: boolean;
  atualizado_em: string;
}

/** Telecom fica no art. 10: não recebe tipo novo pela tela. */
export const SETORES_COM_CATALOGO_EDITAVEL: Setor[] = SETORES.filter((s) => s !== 'telecom');

export const CODIGO_REGEX = /^[a-z][a-z_]{1,39}$/;

export interface NovoTipo {
  setor: Setor;
  codigo: string;
  rotulo: string;
  fonte: string;
}

/** Texto digitado vira código: minúsculas, sem acento, espaço vira "_". */
export function codigoDeRotulo(rotulo: string): string {
  return rotulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Erros do cadastro de um tipo novo, ou lista vazia. `existentes` são os
 * códigos já cadastrados no mesmo setor.
 */
export function validarNovoTipo(novo: NovoTipo, existentes: string[]): string[] {
  const erros: string[] = [];
  if (!SETORES_COM_CATALOGO_EDITAVEL.includes(novo.setor)) {
    erros.push('Telecomunicações segue o art. 10 da Resolução e não recebe tipo novo.');
  }
  const rotulo = novo.rotulo.trim();
  if (rotulo.length < 2 || rotulo.length > 120) erros.push('O nome do tipo tem de ter de 2 a 120 caracteres.');
  const fonte = novo.fonte.trim();
  if (fonte.length < 3 || fonte.length > 500) {
    erros.push('Informe a fonte (ato ou processo que criou o tipo), de 3 a 500 caracteres.');
  }
  if (!CODIGO_REGEX.test(novo.codigo)) erros.push('O código precisa ter só letras minúsculas e "_", de 2 a 40 caracteres.');
  if (novo.codigo === 'outros') erros.push('"Outros" já existe em cada setor e não é criado à parte.');
  if (existentes.includes(novo.codigo)) erros.push(`Já existe um tipo com o código "${novo.codigo}" neste setor.`);
  return erros;
}

export async function listarTipos(): Promise<TipoIntervencao[]> {
  const { data, error } = await supabase
    .from('tipos_intervencao')
    .select('id, setor, codigo, rotulo, fonte, ativo, atualizado_em')
    .order('setor')
    .order('rotulo');
  if (error) throw error;
  return (data ?? []) as TipoIntervencao[];
}

export async function incluirTipo(novo: NovoTipo): Promise<void> {
  const { error } = await supabase.from('tipos_intervencao').insert({
    setor: novo.setor,
    codigo: novo.codigo,
    rotulo: novo.rotulo.trim(),
    fonte: novo.fonte.trim(),
    ativo: true,
  });
  if (error) throw error;
}

/** Só rótulo, fonte e ativo mudam; código e setor são fixos no banco. */
export async function alterarTipo(id: string, mudanca: Pick<TipoIntervencao, 'rotulo' | 'fonte' | 'ativo'>): Promise<void> {
  const { error } = await supabase.from('tipos_intervencao').update({
    rotulo: mudanca.rotulo.trim(),
    fonte: mudanca.fonte.trim(),
    ativo: mudanca.ativo,
  }).eq('id', id);
  if (error) throw error;
}

export const rotuloSetor = (s: Setor) => SETOR_LABEL[s];
