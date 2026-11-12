import type { FeatureCollection, Feature, Point, LineString } from 'geojson';
import { supabase } from './supabase';

/**
 * Obra ou serviço sem licença como aparece no mapa público (view intervencoes_publicas).
 * - sem_licenca: obra ou serviço sem licença cadastrado por nós (amarelo; sai do mapa ao concluir).
 * - publica: obra pública sem licença, executada pelo próprio órgão (violeta; não sai do mapa).
 */
export type CategoriaIntervencao = 'sem_licenca' | 'publica';

export interface IntervencaoPublica {
  id: string;
  categoria: CategoriaIntervencao;
  situacao: string;
  setor: string;
  tipo_intervencao: string;
  escopo: string;
  tipos_obra: string[] | null;
  logradouro: string;
  bairro: string | null;
  referencia: string | null;
  executora: string | null;
  inicio_lat: number | null;
  inicio_lng: number | null;
  fim_lat: number | null;
  fim_lng: number | null;
  inicio_previsto: string | null;
  fim_previsto: string | null;
}

/** Limite da consulta, como nas comunicações. */
const LIMITE = 500;

export async function buscarIntervencoesPublicas(): Promise<IntervencaoPublica[]> {
  const { data, error } = await supabase.from('intervencoes_publicas').select('*').limit(LIMITE);
  if (error) throw error;
  return (data ?? []) as IntervencaoPublica[];
}

export const ROTULO_INTERVENCAO: Record<CategoriaIntervencao, string> = {
  sem_licenca: 'Obra ou serviço sem licença',
  publica: 'Obra pública sem licença',
};

/** Ponto de início, com linha até o fim quando há trecho. Coordenadas no formato [lng, lat]. */
export function intervencoesParaGeoJSON(lista: IntervencaoPublica[]): FeatureCollection {
  const features: Feature[] = lista.flatMap((i): Feature[] => {
    if (i.inicio_lat == null || i.inicio_lng == null) return [];
    const local = i.bairro ? `${i.logradouro} (${i.bairro})` : i.logradouro;
    const propriedades = {
      id: i.id,
      categoria: i.categoria,
      rotulo: ROTULO_INTERVENCAO[i.categoria],
      empresa: i.executora ?? (i.categoria === 'publica' ? 'Execução própria do órgão público' : ''),
      servico: i.escopo,
      local,
      descricao: i.referencia ?? '',
      quando: `${i.inicio_previsto ?? 'início não informado'} a ${i.fim_previsto ?? 'fim não informado'}`,
    };
    const ponto: Feature<Point> = {
      type: 'Feature', properties: propriedades,
      geometry: { type: 'Point', coordinates: [i.inicio_lng, i.inicio_lat] },
    };
    if (i.fim_lat == null || i.fim_lng == null) return [ponto];
    const trecho: Feature<LineString> = {
      type: 'Feature', properties: propriedades,
      geometry: { type: 'LineString', coordinates: [[i.inicio_lng, i.inicio_lat], [i.fim_lng, i.fim_lat]] },
    };
    return [ponto, trecho];
  });
  return { type: 'FeatureCollection', features };
}

/** Obra ou serviço que acontece no dia informado. Sem data, conta como sempre em andamento. */
function acontecendoEmDia(i: IntervencaoPublica, dia: string): boolean {
  const inicio = i.inicio_previsto ?? '0000-01-01';
  const fim = i.fim_previsto ?? '9999-12-31';
  return inicio <= dia && dia <= fim;
}

/**
 * O que o mapa mostra das obras sem licença. A pública fica sempre. A de empresa
 * cadastrada, por padrão só a que acontece hoje; com o filtro ampliado, a janela
 * que a view já aplica (7 dias depois do fim, 15 dias à frente).
 */
export function filtrarIntervencoes(lista: IntervencaoPublica[], ampliado: boolean, hoje: string): IntervencaoPublica[] {
  return lista.filter((i) => i.categoria === 'publica' || ampliado || acontecendoEmDia(i, hoje));
}
