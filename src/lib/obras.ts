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
  /** Podem faltar: licença cancelada ou histórica sem cronograma. */
  inicio_previsto: string | null;
  fim_previsto: string | null;
  situacao: SituacaoPublica;
  executora: string;
  contratante: string | null;
  /** Coordenadas em [longitude, latitude], como no GeoJSON. */
  trechos: {
    logradouro: string; bairro: string | null; inicio: [number, number]; fim: [number, number] | null;
    /** Área da intervenção, quando foi desenhada (GeoJSON Polygon, em [lng, lat]). */
    area?: { type: 'Polygon'; coordinates: [number, number][][] } | null;
  }[];
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
  registro: 'Registro, sem prazo',
};

/** Cores do mapa: as mesmas da situação no restante do sistema. */
export const COR_SITUACAO: Record<SituacaoPublica, string> = {
  vigente: '#1e7b4c',
  aguardando_inicio: '#8f5b00',
  prazo_encerrado: '#b3372c',
  concluida: '#1d4ed8',
  cancelada: '#1f2937',
  registro: '#6b7280',
};

/** Ao abrir, o mapa mostra o que está autorizado agora ou prestes a começar. */
export const FILTRO_OBRAS: { valor: string; rotulo: string; inclui: SituacaoPublica[] }[] = [
  { valor: 'vigentes', rotulo: 'Vigentes e a começar', inclui: ['vigente', 'aguardando_inicio'] },
  { valor: 'todas', rotulo: 'Todas as licenças', inclui: ['vigente', 'aguardando_inicio', 'prazo_encerrado', 'concluida', 'cancelada', 'registro'] },
  { valor: 'encerradas', rotulo: 'Encerradas, concluídas ou canceladas', inclui: ['prazo_encerrado', 'concluida', 'cancelada'] },
];

export interface FiltroObras { situacao: string; ano: string; busca: string; setor?: string; intervencao?: string; origem?: string }

export function filtrarObras(obras: ObraPublica[], f: FiltroObras): ObraPublica[] {
  const inclui = FILTRO_OBRAS.find((x) => x.valor === f.situacao)?.inclui ?? FILTRO_OBRAS[0].inclui;
  const q = f.busca.trim().toLowerCase();
  return obras.filter((o) =>
    inclui.includes(o.situacao)
    && (!f.ano || (o.inicio_previsto ?? '').startsWith(f.ano))
    && (!f.setor || o.setor === f.setor)
    && (!f.intervencao || o.tipo_intervencao === f.intervencao)
    && (!f.origem || o.origem === f.origem)
    && (!q || [o.numero, o.executora, o.contratante ?? '', o.escopo,
               ...o.trechos.flatMap((t) => [t.logradouro, t.bairro ?? ''])]
      .some((s) => s.toLowerCase().includes(q))));
}

/** Anos de início previsto presentes, do mais recente ao mais antigo. */
export const anosDasObras = (obras: ObraPublica[]) =>
  [...new Set(obras.flatMap((o) => (o.inicio_previsto ? [o.inicio_previsto.slice(0, 4)] : [])))].sort().reverse();

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
    features: obras.flatMap((o) => o.trechos.filter((t) => coordenadaValida(t.inicio)).flatMap((t): Feature[] => {
      const properties = {
        codigo: o.codigo, numero: o.numero, situacao: o.situacao, executora: o.executora,
        contratante: o.contratante ?? '', escopo: o.escopo, tipo_intervencao: o.tipo_intervencao, origem: o.origem,
        logradouro: t.logradouro, bairro: t.bairro ?? '',
        inicio_previsto: o.inicio_previsto ?? '', fim_previsto: o.fim_previsto ?? '',
      };
      // Área desenhada: um polígono, além do ponto ou da linha do trecho.
      const area: Feature[] = t.area?.type === 'Polygon' && (t.area.coordinates[0]?.length ?? 0) >= 4
        ? [{ type: 'Feature', properties, geometry: t.area }] : [];
      const traço: Feature = {
        type: 'Feature',
        // Fim igual ao início é um ponto: a linha de comprimento zero não aparece no mapa.
        geometry: coordenadaValida(t.fim) && !mesmoPonto(t.inicio, t.fim)
          ? { type: 'LineString', coordinates: [t.inicio, t.fim] }
          : { type: 'Point', coordinates: t.inicio },
        properties,
      };
      return [...area, traço];
    })),
  };
}

// ---------------------------------------------------------------------
// Faixa do tempo: cada obra vira uma barra no ano, cortada nas bordas.
// ---------------------------------------------------------------------

/** Fração do ano (0 = 1º de janeiro, 1 = fim de dezembro) de uma data ISO. */
export function fracaoDoAno(iso: string, ano: number): number {
  const inicio = Date.UTC(ano, 0, 1);
  const fim = Date.UTC(ano + 1, 0, 1);
  return (Date.parse(`${iso}T00:00:00Z`) - inicio) / (fim - inicio);
}

/**
 * Onde a obra cai no ano: esquerda e largura em fração do ano, já cortadas
 * para caber. Nulo quando não há período ou quando a obra não toca o ano.
 */
export function barraNoAno(o: Pick<ObraPublica, 'inicio_previsto' | 'fim_previsto'>, ano: number)
  : { esquerda: number; largura: number } | null {
  if (!o.inicio_previsto || !o.fim_previsto) return null;
  const a = fracaoDoAno(o.inicio_previsto, ano);
  const b = fracaoDoAno(o.fim_previsto, ano);
  const esq = Math.max(a, 0);
  const dir = Math.min(b, 1);
  if (dir <= 0 || esq >= 1 || dir < esq) return null;
  // Obra de um dia só ainda aparece como barra fina.
  return { esquerda: esq, largura: Math.max(dir - esq, 0.002) };
}

/** Um mês do ano: as obras com período que o tocam e quantas há em cada situação. */
export interface MesDoAno {
  mes: number;
  obras: ObraPublica[];
  porSituacao: Partial<Record<SituacaoPublica, number>>;
}

/** Obras com período que tocam cada mês do ano (uma obra conta em todos os meses que cobre). */
export function obrasNoMes(obras: ObraPublica[], ano: number): MesDoAno[] {
  return Array.from({ length: 12 }, (_, mes) => {
    const primeiro = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10);
    const noMes = obras.filter((o) => !!o.inicio_previsto && !!o.fim_previsto
      && o.inicio_previsto <= ultimo && o.fim_previsto >= primeiro);
    const porSituacao: Partial<Record<SituacaoPublica, number>> = {};
    for (const o of noMes) porSituacao[o.situacao] = (porSituacao[o.situacao] ?? 0) + 1;
    return { mes, obras: noMes, porSituacao };
  });
}

/** Distância em metros entre dois pontos [lng, lat] (fórmula de Haversine). */
export function distanciaMetros(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * As obras mais perto de um ponto, pelo trecho mais próximo de cada obra.
 * Só usa obras com localização; a posição do visitante não é guardada.
 */
export function obrasProximas(obras: ObraPublica[], ponto: [number, number], limite = 5): { obra: ObraPublica; metros: number }[] {
  return obras
    .filter(temLocalizacao)
    .map((obra) => ({
      obra,
      metros: Math.min(...obra.trechos.filter((t) => coordenadaValida(t.inicio)).map((t) => distanciaMetros(ponto, t.inicio))),
    }))
    .sort((a, b) => a.metros - b.metros)
    .slice(0, limite);
}

/** Distância para leitura: "320 m" ou "1,4 km". */
export const textoDistancia = (metros: number) =>
  metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;

/** Filtro do painel público, clicado nos indicadores e nas executoras. */
export interface FiltroPainel {
  /** "vigentes": vigente ou aguardando início. Nulo: todas as situações. */
  situacao: 'vigentes' | null;
  /** Nome da executora, sem diferenciar maiúsculas. Nulo: todas. */
  executora: string | null;
}

/** Obras que atendem ao filtro do painel. Sem filtro, devolve todas. */
export function filtrarPainel(obras: ObraPublica[], f: FiltroPainel): ObraPublica[] {
  const exec = f.executora?.trim().toLowerCase() ?? null;
  return obras.filter((o) => {
    if (f.situacao === 'vigentes' && o.situacao !== 'vigente' && o.situacao !== 'aguardando_inicio') return false;
    if (exec && (o.executora?.trim().toLowerCase() ?? '') !== exec) return false;
    return true;
  });
}
