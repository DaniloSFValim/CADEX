import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapCenter, mapStyle, mapZoom } from '../lib/map';
import { describeGeometry, type DrawKind, type LngLat } from '../lib/geo';
import { Button } from './ui';

/**
 * Desenho da geometria da intervenção (art. 27) e das coordenadas de
 * início e fim do trecho (art. 2º, VII).
 *
 * Implementado direto sobre o MapLibre, sem biblioteca de desenho: o que
 * o formulário precisa é clicar vértices, desfazer o último e marcar dois
 * pontos extremos. Trazer uma dependência de edição para isso custaria
 * mais do que resolveria.
 */

type Mode = 'idle' | 'draw' | 'segment_start' | 'segment_end';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function GeometryEditor({
  kind,
  geometry,
  onGeometryChange,
  segmentStart,
  segmentEnd,
  onSegmentChange,
  className = 'h-[420px]',
}: {
  kind: DrawKind;
  geometry: GeoJSON.Geometry | null;
  onGeometryChange: (g: GeoJSON.Geometry | null) => void;
  segmentStart?: LngLat | null;
  segmentEnd?: LngLat | null;
  onSegmentChange?: (which: 'start' | 'end', p: LngLat) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const [mode, setMode] = useState<Mode>('idle');

  // Refs para que o handler de clique, registrado uma única vez, enxergue
  // sempre o estado corrente sem precisar ser recriado.
  const modeRef = useRef(mode);
  const vertices = useRef<GeoJSON.Position[]>([]);
  /** Marca que a última mudança de geometria veio do próprio desenho. */
  const selfEdit = useRef(false);
  const handlers = useRef({ onGeometryChange, onSegmentChange });
  handlers.current = { onGeometryChange, onSegmentChange };
  modeRef.current = mode;

  const kindRef = useRef(kind);
  kindRef.current = kind;

  const commit = () => {
    const pts = vertices.current;
    const emit = handlers.current.onGeometryChange;
    if (pts.length === 0) return emit(null);

    if (kindRef.current === 'Point') {
      return emit({ type: 'Point', coordinates: pts[pts.length - 1] });
    }
    if (kindRef.current === 'LineString') {
      return emit(pts.length >= 2 ? { type: 'LineString', coordinates: pts } : null);
    }
    if (pts.length >= 3) {
      return emit({ type: 'Polygon', coordinates: [[...pts, pts[0]]] });
    }
    return emit(null);
  };

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: mapStyle(),
      center: mapCenter(),
      zoom: mapZoom(),
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    m.on('load', () => {
      m.addSource('draft', { type: 'geojson', data: EMPTY });
      m.addSource('segment', { type: 'geojson', data: EMPTY });

      m.addLayer({
        id: 'draft-fill', type: 'fill', source: 'draft',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#2b5687', 'fill-opacity': 0.2 },
      });
      m.addLayer({
        id: 'draft-line', type: 'line', source: 'draft',
        filter: ['in', '$type', 'LineString', 'Polygon'],
        paint: { 'line-color': '#2b5687', 'line-width': 4 },
      });
      m.addLayer({
        id: 'draft-vertex', type: 'circle', source: 'draft',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 6, 'circle-color': '#2b5687',
          'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
        },
      });
      m.addLayer({
        id: 'segment-point', type: 'circle', source: 'segment',
        paint: {
          'circle-radius': 8,
          'circle-color': ['match', ['get', 'role'], 'start', '#1f7a5a', '#b3261e'],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
        },
      });
      // Sem camada de rótulo de texto: `text-field` exige a propriedade
      // `glyphs` no estilo, que o fallback raster do projeto não tem — o
      // mapa subia com erro no console. Início e fim se distinguem pela
      // cor, explicada na legenda abaixo do mapa.

      ready.current = true;
      paintDraft();
      paintSegment();
    });

    m.on('click', (e) => {
      const p: GeoJSON.Position = [e.lngLat.lng, e.lngLat.lat];
      const current = modeRef.current;

      if (current === 'segment_start' || current === 'segment_end') {
        handlers.current.onSegmentChange?.(
          current === 'segment_start' ? 'start' : 'end',
          { lng: p[0], lat: p[1] },
        );
        setMode('idle');
        return;
      }
      if (current !== 'draw') return;

      if (kindRef.current === 'Point') vertices.current = [p];
      else vertices.current = [...vertices.current, p];
      selfEdit.current = true;
      commit();
    });

    map.current = m;
    return () => { m.remove(); map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Muda o cursor conforme o modo, para o clique não parecer acidental.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    m.getCanvas().style.cursor = mode === 'idle' ? '' : 'crosshair';
  }, [mode]);

  const paintDraft = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const features: GeoJSON.Feature[] = [];
    if (geometry) features.push({ type: 'Feature', geometry, properties: {} });
    for (const v of vertices.current) {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: {} });
    }
    (m.getSource('draft') as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features });
  };

  const paintSegment = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const features: GeoJSON.Feature[] = [];
    if (segmentStart) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [segmentStart.lng, segmentStart.lat] },
        properties: { role: 'start' },
      });
    }
    if (segmentEnd) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [segmentEnd.lng, segmentEnd.lat] },
        properties: { role: 'end' },
      });
    }
    (m.getSource('segment') as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features });
  };

  useEffect(paintDraft, [geometry]);
  useEffect(paintSegment, [segmentStart, segmentEnd]);

  // Geometria vinda de importação ou de rascunho salvo: enquadra e adota
  // os vértices, para que "desfazer" continue funcionando sobre ela.
  //
  // O reenquadramento NÃO pode acontecer durante o desenho: ao fechar a
  // linha no segundo clique, o mapa dava zoom e o terceiro vértice caía
  // numa coordenada diferente da que o usuário mirou.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !geometry) return;
    if (selfEdit.current) { selfEdit.current = false; return; }
    vertices.current = verticesOf(geometry);
    const b = new maplibregl.LngLatBounds();
    for (const v of vertices.current) b.extend(v as [number, number]);
    if (!b.isEmpty()) m.fitBounds(b, { padding: 60, maxZoom: 17, duration: 300 });
    paintDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, ready.current]);

  const undo = () => {
    vertices.current = vertices.current.slice(0, -1);
    selfEdit.current = true;
    commit();
    paintDraft();
  };

  const clear = () => {
    vertices.current = [];
    handlers.current.onGeometryChange(null);
    setMode('idle');
  };

  const hint =
    mode === 'draw'
      ? kind === 'Point'
        ? 'Clique no mapa para marcar o ponto.'
        : kind === 'LineString'
          ? 'Clique para adicionar vértices ao traçado. Dois ou mais fecham a linha.'
          : 'Clique para adicionar vértices. Três ou mais fecham o polígono.'
      : mode === 'segment_start'
        ? 'Clique na coordenada de INÍCIO do trecho (art. 2º, VII).'
        : mode === 'segment_end'
          ? 'Clique na coordenada de FIM do trecho (art. 2º, VII).'
          : `Definido: ${describeGeometry(geometry)}.`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={mode === 'draw' ? 'primary' : 'secondary'}
          onClick={() => setMode(mode === 'draw' ? 'idle' : 'draw')}
        >
          {mode === 'draw' ? 'Desenhando…' : 'Desenhar no mapa'}
        </Button>
        <Button type="button" variant="secondary" onClick={undo} disabled={vertices.current.length === 0}>
          Desfazer vértice
        </Button>
        <Button type="button" variant="secondary" onClick={clear} disabled={!geometry}>
          Limpar
        </Button>
        {onSegmentChange && (
          <>
            <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />
            <Button
              type="button"
              variant={mode === 'segment_start' ? 'primary' : 'secondary'}
              onClick={() => setMode(mode === 'segment_start' ? 'idle' : 'segment_start')}
            >
              Marcar início do trecho
            </Button>
            <Button
              type="button"
              variant={mode === 'segment_end' ? 'primary' : 'secondary'}
              onClick={() => setMode(mode === 'segment_end' ? 'idle' : 'segment_end')}
            >
              Marcar fim do trecho
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-slate-600" aria-live="polite">{hint}</p>

      {onSegmentChange && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#1f7a5a' }} />
            início do trecho
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#b3261e' }} />
            fim do trecho
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#2b5687' }} />
            vértices do traçado
          </span>
        </p>
      )}

      <div className={`relative w-full overflow-hidden rounded-lg border border-slate-300 ${className}`}>
        <div ref={container} className="h-full w-full" role="application" aria-label="Editor de geometria" />
      </div>
    </div>
  );
}

function verticesOf(g: GeoJSON.Geometry): GeoJSON.Position[] {
  switch (g.type) {
    case 'Point':
      return [g.coordinates];
    case 'LineString':
      return g.coordinates;
    case 'Polygon': {
      const ring = g.coordinates[0] ?? [];
      // O anel fecha repetindo o primeiro ponto; para edição ele sobra.
      return ring.length > 1 ? ring.slice(0, -1) : ring;
    }
    case 'MultiLineString':
      return g.coordinates[0] ?? [];
    case 'MultiPolygon':
      return (g.coordinates[0]?.[0] ?? []).slice(0, -1);
    default:
      return [];
  }
}
