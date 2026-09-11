import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapCenter, mapStyle, mapZoom, toFeatureCollection, KIND_COLOR, KIND_LABEL, type PublicIntervention } from '../lib/map';

/**
 * Mapa real (§26, §27): consome geometrias GeoJSON vindas do PostGIS,
 * com camadas separadas por tipo de intervenção. Não é ilustração.
 */
export function MapView({
  items, onSelect, className = 'h-[480px]', fitToData = true,
}: {
  items: PublicIntervention[];
  onSelect?: (token: string) => void;
  className?: string;
  fitToData?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);

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
    m.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    m.on('load', () => {
      m.addSource('interventions', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'interventions-line',
        type: 'line',
        source: 'interventions',
        filter: ['in', '$type', 'LineString'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.85 },
      });
      m.addLayer({
        id: 'interventions-fill',
        type: 'fill',
        source: 'interventions',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 },
      });
      m.addLayer({
        id: 'interventions-point',
        type: 'circle',
        source: 'interventions',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 7,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });

      for (const layer of ['interventions-point', 'interventions-line', 'interventions-fill']) {
        m.on('click', layer, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Record<string, string>;
          new maplibregl.Popup({ closeButton: true })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="text-sm"><strong>${escapeHtml(p.executor ?? '')}</strong><br/>` +
              `${escapeHtml(KIND_LABEL[p.kind] ?? p.kind)}${p.label ? ` — ${escapeHtml(p.label)}` : ''}<br/>` +
              `<span class="text-slate-500">${escapeHtml(p.status ?? '')}</span></div>`,
            )
            .addTo(m);
          onSelect?.(p.token);
        });
        m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
      }
      ready.current = true;
      applyData();
    });

    map.current = m;
    return () => { m.remove(); map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyData = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const fc = toFeatureCollection(items);
    (m.getSource('interventions') as maplibregl.GeoJSONSource | undefined)?.setData(fc);

    if (fitToData && fc.features.length > 0) {
      const b = new maplibregl.LngLatBounds();
      for (const f of fc.features) extendBounds(b, f.geometry);
      if (!b.isEmpty()) m.fitBounds(b, { padding: 60, maxZoom: 16, duration: 400 });
    }
  };

  useEffect(applyData, [items, fitToData]);

  return (
    <div className={`relative w-full overflow-hidden rounded-lg border border-slate-200 ${className}`}>
      <div ref={container} className="h-full w-full" role="application" aria-label="Mapa de intervenções" />
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-white/95 px-3 py-2 text-xs shadow ring-1 ring-slate-200">
        {Object.entries(KIND_LABEL).map(([k, label]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function extendBounds(b: maplibregl.LngLatBounds, g: GeoJSON.Geometry) {
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      b.extend(c as [number, number]);
    } else if (Array.isArray(c)) {
      c.forEach(walk);
    }
  };
  if ('coordinates' in g) walk(g.coordinates);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
