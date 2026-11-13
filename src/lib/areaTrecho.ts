/**
 * Área da intervenção (polígono) de um trecho. O banco guarda em geometry(Polygon, 4326);
 * o PostgREST devolve essa coluna como WKB em hexadecimal (EWKB). Aqui ficam a leitura
 * desse hexadecimal e as regras do desenho, sem dependências de mapa.
 */

export type Anel = [number, number][]; // [longitude, latitude], sem repetir o primeiro ponto

/** Mesma faixa de Niterói usada nas coordenadas dos trechos e na checagem do banco. */
const NITEROI = { lngMin: -43.25, lngMax: -42.85, latMin: -23.10, latMax: -22.75 };
export const MIN_VERTICES = 3;

/** Lê um polígono em EWKB hexadecimal. Devolve o anel externo, ou null se não for polígono. */
export function lerAreaWkb(hex: string | null | undefined): Anel | null {
  if (!hex || hex.length < 18 || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  const view = new DataView(bytes.buffer);
  if (bytes[0] !== 1) return null; // só little-endian, que é o que o PostGIS devolve
  let pos = 1;
  const tipo = view.getUint32(pos, true); pos += 4;
  if ((tipo & 0x0fffffff) !== 3) return null; // 3 = Polygon
  if (tipo & 0x20000000) pos += 4; // SRID presente
  const aneis = view.getUint32(pos, true); pos += 4;
  if (aneis < 1) return null;
  const pontos = view.getUint32(pos, true); pos += 4;
  const anel: Anel = [];
  for (let i = 0; i < pontos; i++) {
    anel.push([view.getFloat64(pos, true), view.getFloat64(pos + 8, true)]);
    pos += 16;
  }
  // O último ponto repete o primeiro: não entra na lista de vértices.
  return anel.length > 1 ? anel.slice(0, -1) : anel;
}

/** GeoJSON que a função salvar_licenca aceita no campo "area" do trecho. */
export function areaParaGeoJson(anel: Anel): string {
  return JSON.stringify({ type: 'Polygon', coordinates: [[...anel, anel[0]]] });
}

/** EWKT (SRID 4326) aceito pelo PostgREST na coluna geometry. O anel é fechado aqui. */
export function areaParaEwkt(anel: Anel): string {
  const pares = [...anel, anel[0]].map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `SRID=4326;POLYGON((${pares}))`;
}

/** Motivo de o desenho não poder ser salvo, ou null se pode. */
export function problemaArea(anel: Anel): string | null {
  if (anel.length < MIN_VERTICES) return `Marque pelo menos ${MIN_VERTICES} pontos no mapa.`;
  if (anel.some(([lng, lat]) => lng < NITEROI.lngMin || lng > NITEROI.lngMax || lat < NITEROI.latMin || lat > NITEROI.latMax)) {
    return 'Há pontos fora de Niterói.';
  }
  return null;
}

/** Um segmento de rua: linha de dois ou mais pontos, [longitude, latitude], na ordem do traçado. */
export type Segmento = [number, number][];

/**
 * Lê uma MultiLineString em EWKB hexadecimal (coluna "segmentos" do trecho). Cada linha
 * vira um segmento de início e fim; linha com mais de dois pontos fica com o primeiro e o último.
 */
export function lerSegmentosWkb(hex: string | null | undefined): Segmento[] | null {
  if (!hex || hex.length < 18 || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  const view = new DataView(bytes.buffer);
  if (bytes[0] !== 1) return null;
  let pos = 1;
  const tipo = view.getUint32(pos, true); pos += 4;
  if ((tipo & 0x0fffffff) !== 5) return null; // 5 = MultiLineString
  if (tipo & 0x20000000) pos += 4; // SRID presente
  const linhas = view.getUint32(pos, true); pos += 4;
  const segs: Segmento[] = [];
  for (let l = 0; l < linhas; l++) {
    pos += 1; // ordem dos bytes da linha
    const tipoLinha = view.getUint32(pos, true); pos += 4;
    if ((tipoLinha & 0x0fffffff) !== 2) return null; // 2 = LineString
    const pontos = view.getUint32(pos, true); pos += 4;
    const coords: [number, number][] = [];
    for (let i = 0; i < pontos; i++) {
      coords.push([view.getFloat64(pos, true), view.getFloat64(pos + 8, true)]);
      pos += 16;
    }
    if (coords.length >= 2) segs.push(coords);
  }
  return segs;
}

/** EWKT (SRID 4326) da MultiLineString aceita pelo PostgREST na coluna "segmentos" da obra sem licença. */
export function segmentosParaEwkt(segs: Segmento[]): string {
  const linhas = segs.map((s) => `(${s.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`).join(', ');
  return `SRID=4326;MULTILINESTRING(${linhas})`;
}

/**
 * Lê os segmentos em qualquer formato que a API devolve: EWKB em hexadecimal (tabelas) ou o objeto
 * GeoJSON MultiLineString (views). Sem um dos dois, devolve null.
 */
export function lerSegmentos(valor: unknown): Segmento[] | null {
  if (typeof valor === 'string') return lerSegmentosWkb(valor);
  if (valor && typeof valor === 'object' && (valor as { type?: unknown }).type === 'MultiLineString') {
    const coords = (valor as { coordinates?: unknown }).coordinates;
    if (!Array.isArray(coords)) return null;
    const segs = (coords as Segmento[]).filter((s) => Array.isArray(s) && s.length >= 2);
    return segs.length > 0 ? segs : null;
  }
  return null;
}

/** GeoJSON que a função salvar_licenca aceita no campo "segmentos" do trecho. */
export function segmentosParaGeoJson(segs: Segmento[]): string {
  return JSON.stringify({ type: 'MultiLineString', coordinates: segs });
}

/** Motivo de os segmentos não poderem ser salvos, ou null se podem. */
export function problemaSegmentos(segs: Segmento[]): string | null {
  if (segs.length < 1) return 'Marque pelo menos um segmento no mapa.';
  if (segs.some((s) => s.length < 2)) return 'Cada segmento precisa de pelo menos dois pontos.';
  const fora = segs.some((s) => s.some(([lng, lat]) =>
    lng < NITEROI.lngMin || lng > NITEROI.lngMax || lat < NITEROI.latMin || lat > NITEROI.latMax));
  if (fora) return 'Há pontos fora de Niterói.';
  if (segs.some((s) => s.every(([lng, lat]) => lng === s[0][0] && lat === s[0][1]))) {
    return 'Há um segmento com todos os pontos no mesmo lugar.';
  }
  return null;
}
