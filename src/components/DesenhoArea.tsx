import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { estiloBase } from './MapaObras';
import { problemaArea, type Anel } from '../lib/areaTrecho';
import { Button } from './ui';

/** Centro e limites de Niterói, como no mapa público. */
const NITEROI: maplibregl.LngLatBoundsLike = [[-43.135, -22.995], [-42.955, -22.865]];

/**
 * Desenho da área da intervenção: cada clique no mapa acrescenta um vértice.
 * Com três ou mais vértices, o polígono se fecha sozinho. Os vértices são
 * guardados pelo formulário; o mapa só mostra o que o formulário tem.
 */
export default function DesenhoArea({ valor, onChange, ro }: {
  valor: Anel | null; onChange: (anel: Anel | null) => void; ro: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const pronto = useRef(false);
  // O evento de clique é registrado uma vez: a referência garante que ele use o valor atual.
  const atual = useRef({ valor, onChange, ro });
  atual.current = { valor, onChange, ro };

  useEffect(() => {
    let vivo = true;
    estiloBase().then((base) => {
      if (!vivo || !caixa.current) return;
      const m = new maplibregl.Map({
        container: caixa.current, style: base, bounds: NITEROI, maxBounds: [[-43.4, -23.2], [-42.7, -22.6]],
        attributionControl: { compact: true }, cooperativeGestures: true,
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      m.on('load', () => {
        m.addSource('area', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'area-preenchimento', type: 'fill', source: 'area', filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': '#d9780a', 'fill-opacity': 0.3 } });
        m.addLayer({ id: 'area-contorno', type: 'line', source: 'area',
          paint: { 'line-color': '#b85f06', 'line-width': 2.5 } });
        m.addLayer({ id: 'area-vertices', type: 'circle', source: 'area', filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': '#b85f06', 'circle-stroke-width': 2 } });
        pronto.current = true;
        desenhar();
      });
      m.on('click', (e: maplibregl.MapMouseEvent) => {
        const { valor: v, onChange: mudar, ro: somenteLeitura } = atual.current;
        if (somenteLeitura) return;
        mudar([...(v ?? []), [e.lngLat.lng, e.lngLat.lat]]);
      });
      mapa.current = m;
    }).catch(() => undefined);
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; pronto.current = false; };
  }, []);

  // Redesenha sempre que o formulário muda os vértices.
  useEffect(() => { desenhar(); }, [valor]);

  function desenhar() {
    const m = mapa.current;
    if (!m || !pronto.current) return;
    const fonte = m.getSource('area') as maplibregl.GeoJSONSource | undefined;
    if (!fonte) return;
    const pontos = valor ?? [];
    const features: GeoJSON.Feature[] = pontos.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }));
    if (pontos.length >= 3) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...pontos, pontos[0]]] } });
    }
    fonte.setData({ type: 'FeatureCollection', features });
  }

  const pontos = valor?.length ?? 0;
  const aviso = pontos > 0 && pontos < 3 ? 'Marque pelo menos 3 pontos para formar a área.' : problemaArea(valor ?? []);

  return (
    <div className="flex flex-col gap-3">
      <div ref={caixa} className="h-[360px] w-full overflow-hidden rounded-sm border border-tinta-200 bg-tinta-50"
           role="region" aria-label="Mapa para desenhar a área da intervenção" />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-tinta-600" aria-live="polite">
          {pontos === 0 ? 'Nenhum ponto marcado.' : `${pontos} ponto${pontos === 1 ? '' : 's'} marcado${pontos === 1 ? '' : 's'}.`}
          {aviso && <span className="ml-2 text-atencao">{aviso}</span>}
        </span>
        {!ro && pontos > 0 && (
          <>
            <Button variant="secondary" className="px-3! py-1.5!"
                    onClick={() => onChange(valor && valor.length > 1 ? valor.slice(0, -1) : null)}>
              Desfazer último ponto
            </Button>
            <Button variant="secondary" className="px-3! py-1.5!" onClick={() => onChange(null)}>
              Limpar área
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
