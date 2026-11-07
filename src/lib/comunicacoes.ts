import { supabase } from './supabase';
import { hojeISO } from './empresas';

/** Comunicação prévia de serviço programado ao CISP (153). Só empresas cadastradas no CADEX. */
export interface ComunicacaoServico {
  id: string;
  empresa_id: string;
  tipo: 'programado';
  responsavel: string;
  placas: string[];
  local_servico: string;
  descricao: string;
  inicio_previsto: string;
  fim_previsto: string;
  comunicado_em: string;
}

export interface NovaComunicacao {
  empresa_id: string;
  responsavel: string;
  placas: string[];
  local_servico: string;
  descricao: string;
  inicio_previsto: string;
  fim_previsto: string;
}

const PADRAO_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** Aceita placas separadas por vírgula, espaço ou quebra de linha; normaliza para maiúsculas sem hífen. */
export function normalizarPlacas(texto: string): string[] {
  return texto
    .split(/[\s,;]+/)
    .map((p) => p.replace(/-/g, '').toUpperCase())
    .filter((p) => p.length > 0);
}

/** Mensagem do primeiro problema encontrado, ou null se a comunicação pode ser enviada. */
export function validarComunicacao(c: NovaComunicacao, hoje = hojeISO()): string | null {
  if (!c.responsavel.trim()) return 'Informe o responsável pelo serviço.';
  if (c.placas.length === 0) return 'Informe as placas dos veículos que serão usados.';
  const invalida = c.placas.find((p) => !PADRAO_PLACA.test(p));
  if (invalida) return `Placa inválida: ${invalida}. Use o padrão AAA0000 ou AAA0A00.`;
  if (!c.local_servico.trim()) return 'Informe o local do serviço.';
  if (!c.descricao.trim()) return 'Descreva o serviço.';
  if (!c.inicio_previsto) return 'Informe a data de início prevista.';
  if (c.inicio_previsto < hoje) return 'Serviço programado precisa ser comunicado antes do início. A data de início já passou.';
  if (!c.fim_previsto || c.fim_previsto < c.inicio_previsto) return 'A data de fim não pode ser anterior ao início.';
  return null;
}

export async function listarComunicacoes(empresaId: string): Promise<ComunicacaoServico[]> {
  const { data, error } = await supabase.from('comunicacoes_servico').select('*')
    .eq('empresa_id', empresaId).order('inicio_previsto', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ComunicacaoServico[];
}

export async function criarComunicacao(c: NovaComunicacao): Promise<void> {
  const { error } = await supabase.from('comunicacoes_servico').insert({
    ...c,
    responsavel: c.responsavel.trim(),
    local_servico: c.local_servico.trim(),
    descricao: c.descricao.trim(),
    tipo: 'programado',
  });
  if (error) throw error;
}
