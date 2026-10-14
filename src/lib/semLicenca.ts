import { supabase } from './supabase';
import { lerCoordenada, TIPO_INTERVENCAO_LABEL, type TipoIntervencao } from './licencas';
import type { Setor } from './empresas';
import { onlyDigits } from './cnpj';

// ---------------------------------------------------------------------
// Obras e serviços sem licença: registro à parte das licenças. Não entra
// nas contagens, no mapa público nem nos dados abertos.
// ---------------------------------------------------------------------

/** Quem executa: o próprio órgão, empresa cadastrada, ou empresa fora do cadastro. */
export type ModoExecucao = 'propria_orgao' | 'empresa' | 'sem_cadastro';
export type SituacaoSemLicenca = 'em_execucao' | 'concluida' | 'cancelada';

export const MODO_EXECUCAO_LABEL: Record<ModoExecucao, string> = {
  propria_orgao: 'Executa o próprio órgão contratante',
  empresa: 'Empresa cadastrada no CADEX',
  sem_cadastro: 'Empresa fora do cadastro da SECONSER',
};

export const SITUACAO_SEM_LICENCA_LABEL: Record<SituacaoSemLicenca, string> = {
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export interface IntervencaoSemLicenca {
  id: string;
  setor: Setor;
  tipo_intervencao: TipoIntervencao;
  escopo: string;
  contratante_orgao_id: string;
  executora_modo: ModoExecucao;
  executora_id: string | null;
  executora_razao_social: string | null;
  executora_cnpj: string | null;
  logradouro: string;
  bairro: string | null;
  referencia: string | null;
  inicio_lat: number;
  inicio_lng: number;
  fim_lat: number | null;
  fim_lng: number | null;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  situacao: SituacaoSemLicenca;
  concluida_em: string | null;
  processo_sei: string | null;
  contrato_numero: string | null;
  processo_administrativo: string | null;
  ordem_servico_numero: string | null;
  observacoes: string | null;
  licenca_id: string | null;
  atualizado_em: string;
}

/** O que o formulário envia. Campos de texto vazios viram nulo. */
export interface FormSemLicenca {
  setor: Setor;
  tipo_intervencao: TipoIntervencao | '';
  escopo: string;
  contratante_orgao_id: string;
  executora_modo: ModoExecucao;
  executora_id: string;
  executora_razao_social: string;
  executora_cnpj: string;
  logradouro: string;
  bairro: string;
  referencia: string;
  inicio: string;
  fim: string;
  inicio_previsto: string;
  fim_previsto: string;
  situacao: SituacaoSemLicenca;
  concluida_em: string;
  processo_sei: string;
  contrato_numero: string;
  processo_administrativo: string;
  ordem_servico_numero: string;
  observacoes: string;
}

export const FORM_SEM_LICENCA_VAZIO: FormSemLicenca = {
  setor: 'viario', tipo_intervencao: '', escopo: '', contratante_orgao_id: '', executora_modo: 'propria_orgao',
  executora_id: '', executora_razao_social: '', executora_cnpj: '', logradouro: '', bairro: '', referencia: '',
  inicio: '', fim: '', inicio_previsto: '', fim_previsto: '', situacao: 'em_execucao', concluida_em: '',
  processo_sei: '', contrato_numero: '', processo_administrativo: '', ordem_servico_numero: '', observacoes: '',
};

/** Linha do banco, sem os campos que o banco preenche. */
export type LinhaSemLicenca = Omit<IntervencaoSemLicenca, 'id' | 'atualizado_em'> & { id?: string };

/**
 * Confere o formulário antes de enviar. Devolve a mensagem do primeiro problema, ou a linha pronta
 * para o banco. O banco confere de novo (a regra não depende da tela).
 */
export function montarSemLicenca(f: FormSemLicenca): { linha: LinhaSemLicenca } | { erro: string } {
  if (!f.tipo_intervencao) return { erro: 'Escolha o tipo: obra ou serviço.' };
  if (!f.escopo.trim()) return { erro: 'Descreva o escopo da obra ou serviço.' };
  if (!f.contratante_orgao_id) return { erro: 'Escolha o órgão contratante.' };
  if (f.executora_modo === 'empresa' && !f.executora_id) return { erro: 'Escolha a empresa executora.' };
  if (f.executora_modo === 'sem_cadastro') {
    if (!f.executora_razao_social.trim()) return { erro: 'Informe a razão social da empresa executora.' };
    if (f.executora_cnpj.trim() && onlyDigits(f.executora_cnpj).length !== 14) {
      return { erro: 'O CNPJ da empresa precisa ter 14 dígitos.' };
    }
  }
  if (!f.logradouro.trim()) return { erro: 'Informe o logradouro.' };
  const ini = lerCoordenada(f.inicio);
  if (!ini) return { erro: 'Coordenada de início não reconhecida ou fora de Niterói.' };
  const fim = f.fim.trim() ? lerCoordenada(f.fim) : null;
  if (f.fim.trim() && !fim) return { erro: 'Coordenada de fim não reconhecida ou fora de Niterói.' };
  if (f.inicio_previsto && f.fim_previsto && f.fim_previsto < f.inicio_previsto) {
    return { erro: 'O fim previsto não pode ser anterior ao início.' };
  }
  if (f.situacao === 'concluida' && !f.concluida_em) return { erro: 'Informe a data de conclusão.' };

  const n = (v: string) => v.trim() || null;
  const executora = f.executora_modo === 'empresa' ? f.executora_id : null;
  return {
    linha: {
      setor: f.setor,
      tipo_intervencao: f.tipo_intervencao,
      escopo: f.escopo.trim(),
      contratante_orgao_id: f.contratante_orgao_id,
      executora_modo: f.executora_modo,
      executora_id: executora,
      executora_razao_social: f.executora_modo === 'sem_cadastro' ? n(f.executora_razao_social) : null,
      executora_cnpj: f.executora_modo === 'sem_cadastro' && f.executora_cnpj.trim() ? onlyDigits(f.executora_cnpj) : null,
      logradouro: f.logradouro.trim(),
      bairro: n(f.bairro),
      referencia: n(f.referencia),
      inicio_lat: ini.lat,
      inicio_lng: ini.lng,
      fim_lat: fim?.lat ?? null,
      fim_lng: fim?.lng ?? null,
      inicio_previsto: n(f.inicio_previsto),
      fim_previsto: n(f.fim_previsto),
      situacao: f.situacao,
      concluida_em: f.situacao === 'concluida' ? n(f.concluida_em) : null,
      processo_sei: n(f.processo_sei),
      contrato_numero: n(f.contrato_numero),
      processo_administrativo: n(f.processo_administrativo),
      ordem_servico_numero: n(f.ordem_servico_numero),
      observacoes: n(f.observacoes),
      licenca_id: null,
    },
  };
}

export const rotuloTipo = (t: TipoIntervencao) => TIPO_INTERVENCAO_LABEL[t];

export async function listarSemLicenca(): Promise<IntervencaoSemLicenca[]> {
  const { data, error } = await supabase.from('intervencoes_sem_licenca').select('*')
    .order('atualizado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []) as IntervencaoSemLicenca[];
}

export async function salvarSemLicenca(linha: LinhaSemLicenca, id?: string): Promise<void> {
  const { id: _id, ...corpo } = linha;
  const { error } = id
    ? await supabase.from('intervencoes_sem_licenca').update(corpo).eq('id', id)
    : await supabase.from('intervencoes_sem_licenca').insert(corpo);
  if (error) throw error;
}
