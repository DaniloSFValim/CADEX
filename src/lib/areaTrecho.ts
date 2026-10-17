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
