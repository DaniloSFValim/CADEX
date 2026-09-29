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

// Na tela, em caixa normal ("Apta"); a caixa-alta oficial fica na ficha impressa e na planilha.
const emCaixaNormal = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

export function SituacaoBadge({ s }: { s: SituacaoEfetiva }) {
  return <Badge tom={TOM[s]}>{emCaixaNormal(SITUACAO_LABEL[s])}</Badge>;
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
