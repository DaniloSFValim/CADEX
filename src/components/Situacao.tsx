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

export const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
