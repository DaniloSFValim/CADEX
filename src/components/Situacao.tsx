import { Badge, type Tom } from './ui';
import { SITUACAO_LABEL, type SituacaoEfetiva } from '../lib/empresas';

const TOM: Record<SituacaoEfetiva, Tom> = {
  em_analise: 'neutro',
  apta: 'bom',
  em_saneamento: 'alerta',
  inapta: 'ruim',
  indeferida: 'ruim',
  vencida: 'ruim',
};

export function SituacaoBadge({ s }: { s: SituacaoEfetiva }) {
  return <Badge tom={TOM[s]}>{SITUACAO_LABEL[s]}</Badge>;
}

/** Filete à esquerda na cor da situação: o selo de cada registro. */
export const BARRA: Record<SituacaoEfetiva, string> = {
  em_analise: 'border-l-tinta-300',
  apta: 'border-l-alta',
  em_saneamento: 'border-l-atencao',
  inapta: 'border-l-baixa',
  indeferida: 'border-l-baixa',
  vencida: 'border-l-baixa',
};

export const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
