import type { StyleSpecification } from 'maplibre-gl';

/**
 * Estilo de fallback (§37): raster OSM. Serve para o sistema funcionar
 * sem depender de um provedor de tiles vetoriais contratado. Assim que o
 * Município dispuser do seu próprio style.json (ou de um contrato de
 * tiles), basta preencher VITE_MAP_STYLE_URL — nada no código muda.
 * Ver GIS.md, seção "Base cartográfica".
 */
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export const mapStyle = (): string | StyleSpecification =>
  import.meta.env.VITE_MAP_STYLE_URL || FALLBACK_STYLE;

export const mapCenter = (): [number, number] => [
  Number(import.meta.env.VITE_MAP_CENTER_LNG ?? -43.1729),
  Number(import.meta.env.VITE_MAP_CENTER_LAT ?? -22.9068),
];

export const mapZoom = (): number => Number(import.meta.env.VITE_MAP_ZOOM ?? 12);

/** Cores por tipo de intervenção — usadas no mapa e nas legendas (§26). */
export const KIND_COLOR: Record<string, string> = {
  obra: '#2b5687',
  manutencao: '#1f7a5a',
  emergencia: '#b3261e',
};

export const KIND_LABEL: Record<string, string> = {
  obra: 'Obra licenciada',
  manutencao: 'Manutenção rotineira',
  emergencia: 'Emergência',
};

export interface PublicIntervention {
  public_token: string;
  kind: 'obra' | 'manutencao' | 'emergencia';
  type_name: string | null;
  executor_name: string;
  executor_cadex: string | null;
  concessionaire_name: string | null;
  license_number: string | null;
  declaration_number: string | null;
  scope: string | null;
  description: string;
  street: string | null;
  district: string | null;
  segment_from: string | null;
  segment_to: string | null;
  starts_on: string | null;
  ends_on: string | null;
  started_at: string | null;
  finished_at: string | null;
  status: string;
  geometry: GeoJSON.Geometry;
}

/** Converte as linhas da view pública em FeatureCollection para o MapLibre. */
export function toFeatureCollection(
  rows: PublicIntervention[],
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rows
      .filter((r) => r.geometry)
      .map((r) => ({
        type: 'Feature' as const,
        geometry: r.geometry,
        properties: {
          token: r.public_token,
          kind: r.kind,
          color: KIND_COLOR[r.kind] ?? '#555',
          executor: r.executor_name,
          status: r.status,
          label: r.license_number ?? r.declaration_number ?? r.type_name ?? '',
        },
      })),
  };
}
