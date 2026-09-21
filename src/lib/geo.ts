/**
 * Geometria do lado do cliente (art. 2º, VII; art. 27).
 *
 * O banco é quem valida de verdade: a coluna é `geometry(Geometry, 4326)`
 * e o PostGIS recusa o que não for geometria legítima naquele SRID. Aqui
 * só convertemos formatos e damos aviso imediato ao usuário.
 */

export type DrawKind = 'Point' | 'LineString' | 'Polygon';

export interface LngLat {
  lng: number;
  lat: number;
}

/** WGS 84 — o único SRID aceito pelo banco. */
export const SRID = 4326;

const fmt = (n: number): string => Number(n.toFixed(7)).toString();

/**
 * GeoJSON → EWKT. É assim que a geometria viaja até o PostgREST: o
 * PostgreSQL converte o texto para `geometry` na entrada da coluna, e o
 * SRID vai explícito para não depender de default nenhum.
 */
export function toEwkt(geom: GeoJSON.Geometry): string {
  const ring = (r: GeoJSON.Position[]): string =>
    `(${r.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join(',')})`;

  switch (geom.type) {
    case 'Point':
      return `SRID=${SRID};POINT(${fmt(geom.coordinates[0])} ${fmt(geom.coordinates[1])})`;
    case 'LineString':
      return `SRID=${SRID};LINESTRING${ring(geom.coordinates)}`;
    case 'Polygon':
      return `SRID=${SRID};POLYGON(${geom.coordinates.map(ring).join(',')})`;
    case 'MultiLineString':
      return `SRID=${SRID};MULTILINESTRING(${geom.coordinates.map(ring).join(',')})`;
    case 'MultiPolygon':
      return `SRID=${SRID};MULTIPOLYGON(${geom.coordinates
        .map((poly) => `(${poly.map(ring).join(',')})`)
        .join(',')})`;
    default:
      throw new Error(`Geometria ${geom.type} não é aceita neste cadastro.`);
  }
}

export function pointEwkt(p: LngLat): string {
  return `SRID=${SRID};POINT(${fmt(p.lng)} ${fmt(p.lat)})`;
}

/** Aceita "-22.8832, -43.1036" ou "-43.1036 -22.8832" conforme a ordem pedida. */
export function parseLatLng(input: string): LngLat | null {
  const parts = (input ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0].replace(',', '.'));
  const lng = Number(parts[1].replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lng, lat };
}

export function formatLatLng(p: LngLat | null): string {
  return p ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : '';
}

/** Distância entre dois pontos em metros (Haversine). Estimativa para a UI. */
function haversine(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Extensão aproximada, em metros. Serve para pré-preencher `length_m` e
 * para o usuário conferir a ordem de grandeza do que desenhou. O número
 * definitivo é o do projeto, que o requerente pode corrigir à mão.
 */
export function approximateLengthM(geom: GeoJSON.Geometry | null): number | null {
  if (!geom) return null;
  const line = (coords: GeoJSON.Position[]): number =>
    coords.slice(1).reduce((sum, p, i) => sum + haversine(coords[i], p), 0);

  switch (geom.type) {
    case 'LineString':
      return Math.round(line(geom.coordinates));
    case 'MultiLineString':
      return Math.round(geom.coordinates.reduce((s, c) => s + line(c), 0));
    case 'Polygon':
      return Math.round(line(geom.coordinates[0] ?? []));
    default:
      return null;
  }
}

export function firstAndLast(geom: GeoJSON.Geometry | null): [LngLat, LngLat] | null {
  if (!geom) return null;
  const coords: GeoJSON.Position[] =
    geom.type === 'LineString' ? geom.coordinates
    : geom.type === 'MultiLineString' ? (geom.coordinates[0] ?? [])
    : geom.type === 'Polygon' ? (geom.coordinates[0] ?? [])
    : [];
  if (coords.length < 2) return null;
  const a = coords[0];
  const b = coords[coords.length - 1];
  return [{ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] }];
}

export function describeGeometry(geom: GeoJSON.Geometry | null): string {
  if (!geom) return 'nenhuma geometria definida';
  const n = (c: unknown): number => (Array.isArray(c) ? c.length : 0);
  switch (geom.type) {
    case 'Point':
      return 'ponto';
    case 'LineString':
      return `linha com ${n(geom.coordinates)} vértices`;
    case 'MultiLineString':
      return `${n(geom.coordinates)} linhas`;
    case 'Polygon':
      return `polígono com ${n(geom.coordinates[0]) - 1} lados`;
    case 'MultiPolygon':
      return `${n(geom.coordinates)} polígonos`;
    default:
      return geom.type;
  }
}

// ---------------------------------------------------------------------
// Importação de arquivos geoespaciais (§27)
// ---------------------------------------------------------------------

export interface ImportResult {
  geometry: GeoJSON.Geometry;
  /** Quantas feições o arquivo trazia; só a primeira utilizável é usada. */
  featureCount: number;
  source: 'geojson' | 'kml';
}

const USABLE = new Set([
  'Point', 'LineString', 'Polygon', 'MultiLineString', 'MultiPolygon',
]);

function firstUsable(g: GeoJSON.Geometry | null): GeoJSON.Geometry | null {
  if (!g) return null;
  if (g.type === 'GeometryCollection') {
    for (const inner of g.geometries) {
      const found = firstUsable(inner);
      if (found) return found;
    }
    return null;
  }
  return USABLE.has(g.type) ? g : null;
}

function fromGeoJsonText(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Arquivo GeoJSON inválido: não é JSON.');
  }
  const obj = parsed as { type?: string; features?: unknown[]; geometry?: unknown };

  const candidates: GeoJSON.Geometry[] = [];
  if (obj?.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    for (const f of obj.features as { geometry?: GeoJSON.Geometry }[]) {
      if (f?.geometry) candidates.push(f.geometry);
    }
  } else if (obj?.type === 'Feature' && obj.geometry) {
    candidates.push(obj.geometry as GeoJSON.Geometry);
  } else if (typeof obj?.type === 'string') {
    candidates.push(parsed as GeoJSON.Geometry);
  }

  for (const c of candidates) {
    const usable = firstUsable(c);
    if (usable) {
      return { geometry: usable, featureCount: candidates.length, source: 'geojson' };
    }
  }
  throw new Error('O GeoJSON não traz ponto, linha nem polígono utilizável.');
}

function parseKmlCoordinates(raw: string | null): GeoJSON.Position[] {
  return (raw ?? '')
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(',').map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => [p[0], p[1]] as GeoJSON.Position);
}

function fromKmlText(text: string): ImportResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Arquivo KML inválido: XML malformado.');
  }

  const placemarks = doc.getElementsByTagName('Placemark');
  const count = placemarks.length || 1;
  const scope: ParentNode = placemarks.length > 0 ? placemarks[0] : doc;

  const polygon = scope.querySelector('Polygon');
  if (polygon) {
    const outer = parseKmlCoordinates(
      polygon.querySelector('outerBoundaryIs LinearRing coordinates')?.textContent ??
        polygon.querySelector('LinearRing coordinates')?.textContent ?? null,
    );
    if (outer.length >= 4) {
      return { geometry: { type: 'Polygon', coordinates: [outer] }, featureCount: count, source: 'kml' };
    }
  }

  const lineString = scope.querySelector('LineString coordinates');
  if (lineString) {
    const coords = parseKmlCoordinates(lineString.textContent);
    if (coords.length >= 2) {
      return { geometry: { type: 'LineString', coordinates: coords }, featureCount: count, source: 'kml' };
    }
  }

  const point = scope.querySelector('Point coordinates');
  if (point) {
    const coords = parseKmlCoordinates(point.textContent);
    if (coords.length >= 1) {
      return { geometry: { type: 'Point', coordinates: coords[0] }, featureCount: count, source: 'kml' };
    }
  }

  throw new Error('O KML não traz ponto, linha nem polígono utilizável.');
}

/**
 * Lê GeoJSON (.json/.geojson) ou KML (.kml). KMZ e Shapefile não são
 * aceitos aqui: exigiriam descompactação e leitura binária, e entrariam
 * como dependência nova sem necessidade — o exportador de qualquer
 * software de projeto gera GeoJSON ou KML.
 */
export async function importGeometryFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  const name = file.name.toLowerCase();
  if (name.endsWith('.kml') || text.trimStart().startsWith('<')) {
    return fromKmlText(text);
  }
  return fromGeoJsonText(text);
}
