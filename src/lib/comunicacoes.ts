import { supabase } from './supabase';
import { hojeISO } from './empresas';

/**
 * Comunicação ao CISP (153), em duas modalidades:
 * - programado: serviço de manutenção de telecomunicações; registro no CADEX antes do início.
 * - emergencia: atendimento de emergência de concessionária de telecomunicações; ligação ao 153
 *   antes de agir, registro no CADEX depois do fato, em até 72 horas.
 */
export type TipoComunicacao = 'programado' | 'emergencia';

export const PRAZO_EMERGENCIA_HORAS = 72;

export const TIPO_COMUNICACAO_LABEL: Record<TipoComunicacao, string> = {
  programado: 'Serviço programado',
  emergencia: 'Emergência',
};

export interface ComunicacaoServico {
  id: string;
  empresa_id: string;
  tipo: TipoComunicacao;
  tipo_servico: string | null;
  responsavel: string;
  placas: string[];
  local_servico: string;
  descricao: string;
  inicio_previsto: string;
  fim_previsto: string;
  comunicado_em: string;
  ocorrido_em: string | null;
  protocolo_cisp: string | null;
  inicio_lat: number | null;
  inicio_lng: number | null;
  fim_lat: number | null;
  fim_lng: number | null;
}

export interface NovaComunicacao {
  empresa_id: string;
  tipo: TipoComunicacao;
  tipo_servico: string;
  responsavel: string;
  placas: string[];
  local_servico: string;
  descricao: string;
  inicio_previsto: string;
  fim_previsto: string;
  /** Emergência: data e hora do fato (ISO). */
  ocorrido_em?: string | null;
  protocolo_cisp?: string | null;
  inicio_lat: number | null;
  inicio_lng: number | null;
  fim_lat?: number | null;
  fim_lng?: number | null;
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
export function validarComunicacao(c: NovaComunicacao, hoje = hojeISO(), agora = new Date()): string | null {
  if (!c.tipo_servico.trim()) return 'Informe o tipo de serviço.';
  if (!c.responsavel.trim()) return 'Informe o responsável pelo serviço.';
  if (c.placas.length === 0) return 'Informe as placas dos veículos que serão usados.';
  const invalida = c.placas.find((p) => !PADRAO_PLACA.test(p));
  if (invalida) return `Placa inválida: ${invalida}. Use o padrão AAA0000 ou AAA0A00.`;
  if (!c.local_servico.trim()) return 'Informe a referência do local (rua, bairro ou número).';
  if (c.inicio_lat == null || c.inicio_lng == null) return 'Marque o local no mapa ou cole as coordenadas.';
  if (!c.descricao.trim()) return 'Descreva o serviço.';

  if (c.tipo === 'emergencia') {
    if (!c.ocorrido_em) return 'Informe a data e a hora em que a emergência começou.';
    const fato = new Date(c.ocorrido_em);
    if (fato.getTime() > agora.getTime()) return 'A data e a hora da emergência não podem estar no futuro.';
    const horas = (agora.getTime() - fato.getTime()) / 3_600_000;
    if (horas > PRAZO_EMERGENCIA_HORAS) {
      return `Emergência precisa ser registrada em até ${PRAZO_EMERGENCIA_HORAS} horas do fato.`;
    }
    if (!c.fim_previsto) return 'Informe a previsão de término.';
    return null;
  }

  if (!c.inicio_previsto) return 'Informe a data de início prevista.';
  if (c.inicio_previsto < hoje) return 'Serviço programado precisa ser registrado antes do início. A data de início já passou.';
  if (!c.fim_previsto || c.fim_previsto < c.inicio_previsto) return 'A data de fim não pode ser anterior ao início.';
  return null;
}

export async function listarComunicacoes(empresaId: string): Promise<ComunicacaoServico[]> {
  const { data, error } = await supabase.from('comunicacoes_servico').select('*')
    .eq('empresa_id', empresaId).order('comunicado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ComunicacaoServico[];
}

export async function criarComunicacao(c: NovaComunicacao): Promise<void> {
  const emergencia = c.tipo === 'emergencia';
  const { error } = await supabase.from('comunicacoes_servico').insert({
    empresa_id: c.empresa_id,
    tipo: c.tipo,
    tipo_servico: c.tipo_servico.trim(),
    responsavel: c.responsavel.trim(),
    placas: c.placas,
    local_servico: c.local_servico.trim(),
    descricao: c.descricao.trim(),
    // Emergência: o banco define o início a partir da data do fato.
    inicio_previsto: emergencia ? (c.ocorrido_em ?? '').slice(0, 10) : c.inicio_previsto,
    fim_previsto: c.fim_previsto,
    ocorrido_em: emergencia ? c.ocorrido_em : null,
    protocolo_cisp: emergencia ? (c.protocolo_cisp?.trim() || null) : null,
    inicio_lat: c.inicio_lat,
    inicio_lng: c.inicio_lng,
    fim_lat: c.fim_lat ?? null,
    fim_lng: c.fim_lng ?? null,
  });
  if (error) throw error;
}
