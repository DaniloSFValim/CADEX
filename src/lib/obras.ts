import type { Feature, FeatureCollection } from 'geojson';
import { supabase } from './supabase';
import { baixarArquivo } from './exportar';
import type { Setor } from './empresas';
import type { OrigemIntervencao, SituacaoPublica, TipoIntervencao, TipoObra } from './licencas';

// ---------------------------------------------------------------------
// Mapa público de obras licenciadas: dados da função obras_publicas()
// ---------------------------------------------------------------------

export interface ObraPublica {
  /** Código público: leva à página da licença (/licenca/:codigo). */
  codigo: string;
  setor: Setor;
  numero: string;
  tipos_obra: TipoObra[];
  /** Obra ou serviço, e quem origina (concessionária, Prefeitura, autarquia…). */
  tipo_intervencao: TipoIntervencao;
  origem: OrigemIntervencao;
  escopo: string;
  /** Podem faltar: licença cancelada ou histórica sem cronograma ou sem decisão. */
  inicio_previsto: string | null;
  fim_previsto: string | null;
  decisao_data: string | null;
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

/**
 * Dados abertos: baixa as obras licenciadas como GeoJSON (uma Feature por
 * trecho). Mesma seleção do mapa público; sem dado interno.
 */
export async function baixarObrasGeojson(): Promise<void> {
  const { data, error } = await supabase.rpc('obras_geojson');
  if (error) throw error;
  baixarArquivo('obras-licenciadas-niteroi.geojson', JSON.stringify(data), 'application/geo+json;charset=utf-8');
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

export interface FiltroObras { situacao: string; ano: string; busca: string; setor?: string; intervencao?: string; origem?: string }

export function filtrarObras(obras: ObraPublica[], f: FiltroObras): ObraPublica[] {
  const inclui = FILTRO_OBRAS.find((x) => x.valor === f.situacao)?.inclui ?? FILTRO_OBRAS[0].inclui;
  const q = f.busca.trim().toLowerCase();
  return obras.filter((o) =>
    inclui.includes(o.situacao)
    && (!f.ano || (o.decisao_data ?? '').startsWith(f.ano))
    && (!f.setor || o.setor === f.setor)
    && (!f.intervencao || o.tipo_intervencao === f.intervencao)
    && (!f.origem || o.origem === f.origem)
    && (!q || [o.numero, o.executora, o.contratante ?? '', o.escopo,
               ...o.trechos.flatMap((t) => [t.logradouro, t.bairro ?? ''])]
      .some((s) => s.toLowerCase().includes(q))));
}

/** Anos de emissão presentes, do mais recente ao mais antigo. */
export const anosDasObras = (obras: ObraPublica[]) =>
  [...new Set(obras.flatMap((o) => (o.decisao_data ? [o.decisao_data.slice(0, 4)] : [])))].sort().reverse();

/** Coordenada utilizável no mapa: [longitude, latitude] finitas e dentro do planeta. */
const coordenadaValida = (c: unknown): c is [number, number] =>
  Array.isArray(c) && c.length === 2 && c.every((n) => typeof n === 'number' && Number.isFinite(n))
  && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;

const mesmoPonto = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

/** A obra tem ao menos um trecho que o mapa consegue desenhar. */
export const temLocalizacao = (o: ObraPublica) => o.trechos.some((t) => coordenadaValida(t.inicio));

/**
 * GeoJSON para o mapa: cada trecho vira uma feição. Trecho com fim é uma
 * linha reta do início ao fim (não segue o traçado da rua); sem fim, é um
 * ponto.
 */
export function obrasParaGeoJSON(obras: ObraPublica[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    // Trecho sem coordenada utilizável não é desenhado (nem inventado): a lista
    // da consulta avisa que a obra está sem localização.
    features: obras.flatMap((o) => o.trechos.filter((t) => coordenadaValida(t.inicio)).map((t): Feature => ({
      type: 'Feature',
      // Fim igual ao início é um ponto: a linha de comprimento zero não aparece no mapa.
      geometry: coordenadaValida(t.fim) && !mesmoPonto(t.inicio, t.fim)
        ? { type: 'LineString', coordinates: [t.inicio, t.fim] }
        : { type: 'Point', coordinates: t.inicio },
      properties: {
        codigo: o.codigo, numero: o.numero, situacao: o.situacao, executora: o.executora,
        contratante: o.contratante ?? '', escopo: o.escopo, tipo_intervencao: o.tipo_intervencao, origem: o.origem,
        logradouro: t.logradouro, bairro: t.bairro ?? '',
        inicio_previsto: o.inicio_previsto ?? '', fim_previsto: o.fim_previsto ?? '',
      },
    }))),
  };
}
