import type { FeatureCollection, Feature, Point, LineString } from 'geojson';
import { supabase } from './supabase';
import type { TipoComunicacao } from './comunicacoes';

/** Comunicação ao CISP como aparece na consulta pública (view comunicacoes_publicas). */
export interface ComunicacaoPublica {
  id: string;
  tipo: TipoComunicacao;
  razao_social: string;
  codigo_cadex: string;
  tipo_servico: string | null;
  descricao: string;
  local_servico: string;
  placas: string[];
  inicio_lat: number | null;
  inicio_lng: number | null;
  fim_lat: number | null;
  fim_lng: number | null;
  ocorrido_em: string | null;
  inicio_previsto: string;
  fim_previsto: string;
  comunicado_em: string;
}

/** Limite da consulta: as comunicações mais recentes. */
const LIMITE = 500;

export async function buscarComunicacoesPublicas(): Promise<ComunicacaoPublica[]> {
  const { data, error } = await supabase.from('comunicacoes_publicas').select('*')
    .order('comunicado_em', { ascending: false }).limit(LIMITE);
  if (error) throw error;
  return (data ?? []) as ComunicacaoPublica[];
}

/** Rótulos de cada modalidade, usados no mapa e na legenda. */
export const ROTULO_COMUNICACAO: Record<TipoComunicacao, string> = {
  emergencia: 'Emergência',
  programado: 'Serviço programado',
};

/** Ponto de início (e linha até o fim, quando há trecho). Coordenadas no formato [lng, lat]. */
export function comunicacoesParaGeoJSON(lista: ComunicacaoPublica[]): FeatureCollection {
  const features: Feature[] = lista.flatMap((c): Feature[] => {
    if (c.inicio_lat == null || c.inicio_lng == null) return [];
    const propriedades = {
      id: c.id, tipo: c.tipo, rotulo: ROTULO_COMUNICACAO[c.tipo], empresa: c.razao_social,
      servico: c.tipo_servico ?? '', local: c.local_servico, descricao: c.descricao,
      quando: c.tipo === 'emergencia' && c.ocorrido_em ? c.ocorrido_em : `${c.inicio_previsto} a ${c.fim_previsto}`,
    };
    const ponto: Feature<Point> = {
      type: 'Feature', properties: propriedades,
      geometry: { type: 'Point', coordinates: [c.inicio_lng, c.inicio_lat] },
    };
    if (c.fim_lat == null || c.fim_lng == null) return [ponto];
    const trecho: Feature<LineString> = {
      type: 'Feature', properties: propriedades,
      geometry: { type: 'LineString', coordinates: [[c.inicio_lng, c.inicio_lat], [c.fim_lng, c.fim_lat]] },
    };
    return [ponto, trecho];
  });
  return { type: 'FeatureCollection', features };
}
