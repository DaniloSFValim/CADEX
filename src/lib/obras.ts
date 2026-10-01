import type { Feature, FeatureCollection } from 'geojson';
import { supabase } from './supabase';
import type { SituacaoPublica, TipoObra } from './licencas';

// ---------------------------------------------------------------------
// Mapa público de obras licenciadas: dados da função obras_publicas()
// ---------------------------------------------------------------------

export interface ObraPublica {
  /** Código público: leva à página da licença (/licenca/:codigo). */
  codigo: string;
  numero: string;
  tipos_obra: TipoObra[];
  escopo: string;
  inicio_previsto: string;
  fim_previsto: string;
  decisao_data: string;
  situacao: SituacaoPublica;
  executora: string;
  contratante: string | null;
  /** Coordenadas em [longitude, latitude], como no GeoJSON. */
  trechos: { logradouro: string; bairro: string | null; inicio: [number, number]; fim: [number, number] | null }[];
}

export async function buscarObrasPublicas(): Promise<ObraPublica[]> {
  const { data, error } = await supabase.rpc('obras_publicas');
  if (error) throw error;
  return (data as ObraPublica[] | null) ?? [];
}

export const SITUACAO_PUBLICA_LABEL: Record<SituacaoPublica, string> = {
  vigente: 'Vigente',
  aguardando_inicio: 'Aguardando início',
  prazo_encerrado: 'Prazo encerrado',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

/** Cores do mapa: as mesmas da situação no restante do sistema. */
export const COR_SITUACAO: Record<SituacaoPublica, string> = {
  vigente: '#1e7b4c',
  aguardando_inicio: '#8f5b00',
  prazo_encerrado: '#b3372c',
  concluida: '#6b7280',
  cancelada: '#1f2937',
};

/** Ao abrir, o mapa mostra o que está autorizado agora ou prestes a começar. */
export const FILTRO_OBRAS: { valor: string; rotulo: string; inclui: SituacaoPublica[] }[] = [
  { valor: 'vigentes', rotulo: 'Vigentes e a começar', inclui: ['vigente', 'aguardando_inicio'] },
  { valor: 'todas', rotulo: 'Todas as licenças', inclui: ['vigente', 'aguardando_inicio', 'prazo_encerrado', 'concluida', 'cancelada'] },
  { valor: 'encerradas', rotulo: 'Encerradas, concluídas ou canceladas', inclui: ['prazo_encerrado', 'concluida', 'cancelada'] },
];

export interface FiltroObras { situacao: string; ano: string; busca: string }

export function filtrarObras(obras: ObraPublica[], f: FiltroObras): ObraPublica[] {
  const inclui = FILTRO_OBRAS.find((x) => x.valor === f.situacao)?.inclui ?? FILTRO_OBRAS[0].inclui;
  const q = f.busca.trim().toLowerCase();
  return obras.filter((o) =>
    inclui.includes(o.situacao)
    && (!f.ano || o.decisao_data.startsWith(f.ano))
    && (!q || [o.numero, o.executora, o.contratante ?? '', o.escopo,
               ...o.trechos.flatMap((t) => [t.logradouro, t.bairro ?? ''])]
      .some((s) => s.toLowerCase().includes(q))));
}

/** Anos de emissão presentes, do mais recente ao mais antigo. */
export const anosDasObras = (obras: ObraPublica[]) =>
  [...new Set(obras.map((o) => o.decisao_data.slice(0, 4)))].sort().reverse();

/**
 * GeoJSON para o mapa: cada trecho vira uma feição. Trecho com fim é uma
 * linha reta do início ao fim (não segue o traçado da rua); sem fim, é um
 * ponto.
 */
export function obrasParaGeoJSON(obras: ObraPublica[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: obras.flatMap((o) => o.trechos.map((t): Feature => ({
      type: 'Feature',
      geometry: t.fim
        ? { type: 'LineString', coordinates: [t.inicio, t.fim] }
        : { type: 'Point', coordinates: t.inicio },
      properties: {
        codigo: o.codigo, numero: o.numero, situacao: o.situacao, executora: o.executora,
        logradouro: t.logradouro, bairro: t.bairro ?? '', fim_previsto: o.fim_previsto,
      },
    }))),
  };
}
