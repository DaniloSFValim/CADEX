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

/** Janela de exibição, em dias, nos dois sentidos (programado à frente, emergência para trás). */
export const DIAS_JANELA = 15;

/** Dia de hoje em Niterói, em AAAA-MM-DD, independentemente do fuso de quem consulta. */
export function hojeNiteroi(agora: Date = new Date()): string {
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Soma dias a uma data AAAA-MM-DD (aritmética de calendário, sem fuso). */
function somarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** O serviço acontece no dia informado (o intervalo inclui início e fim). */
export function acontecendoEm(c: ComunicacaoPublica, dia: string): boolean {
  return c.inicio_previsto <= dia && dia <= c.fim_previsto;
}

/**
 * Janela de 15 dias de cada modalidade: programado de hoje a 15 dias à frente;
 * emergência de 15 dias atrás até hoje. Espelha a view comunicacoes_publicas.
 */
export function naJanela(c: ComunicacaoPublica, hoje: string): boolean {
  if (c.tipo === 'programado') {
    return c.fim_previsto >= hoje && c.inicio_previsto <= somarDias(hoje, DIAS_JANELA);
  }
  return c.fim_previsto >= somarDias(hoje, -DIAS_JANELA) && c.inicio_previsto <= hoje;
}

/**
 * O que o mapa mostra. Por padrão, só o que acontece hoje. Com o filtro
 * ampliado, a janela de 15 dias de cada modalidade.
 */
export function filtrarComunicacoes(lista: ComunicacaoPublica[], ampliado: boolean, hoje: string): ComunicacaoPublica[] {
  return ampliado ? lista.filter((c) => naJanela(c, hoje)) : lista.filter((c) => acontecendoEm(c, hoje));
}
