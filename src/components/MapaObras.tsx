import { layers, namedFlavor } from '@protomaps/basemaps';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
// O MapLibre 6 roda o processamento num worker separado. O Vite empacota esse
// worker num arquivo próprio e o endereço é informado aqui; sem isso o mapa
// procura o arquivo ao lado do código empacotado e não o encontra.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { useEffect, useRef, useState } from 'react';
import { COR_SITUACAO, obrasParaGeoJSON, type ObraPublica } from '../lib/obras';
import type { SituacaoPublica } from '../lib/licencas';

/** Niterói, com folga. */
const NITEROI: maplibregl.LngLatBoundsLike = [[-43.135, -22.995], [-42.955, -22.865]];
const ATRIBUICAO = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores do OpenStreetMap</a>';

let protocoloRegistrado = false;

/**
 * Base própria (public/mapa, gerada pela automação "Base do mapa"), servida
 * pelo próprio site. Enquanto ela não existir, usa os blocos públicos do
 * OpenStreetMap, sem garantia de disponibilidade: só para a fase piloto.
 */
export async function estiloBase(): Promise<StyleSpecification> {
  const origem = window.location.origin;
  const arquivo = `${origem}/mapa/niteroi.pmtiles`;
  let temBase = false;
  try {
    const r = await fetch(arquivo, { method: 'HEAD' });
    // O site devolve a página (text/html) para endereço inexistente.
    temBase = r.ok && !(r.headers.get('content-type') ?? '').includes('text/html');
  } catch { temBase = false; }

  if (temBase) {
    if (!protocoloRegistrado) {
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      protocoloRegistrado = true;
    }
    return {
      version: 8,
      glyphs: `${origem}/mapa/fontes/{fontstack}/{range}.pbf`,
      sprite: `${origem}/mapa/sprites/light`,
      sources: { base: { type: 'vector', url: `pmtiles://${arquivo}`, attribution: ATRIBUICAO } },
      layers: layers('base', namedFlavor('light'), { lang: 'pt' }),
    };
  }
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256,
        maxzoom: 19, attribution: ATRIBUICAO,
      },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

const corPorSituacao = [
  'match', ['get', 'situacao'],
  ...(Object.entries(COR_SITUACAO) as [SituacaoPublica, string][]).flat(),
  '#6b7280',
] as unknown as maplibregl.ExpressionSpecification;

/** Conteúdo do balão: montado com nós de texto, nunca com HTML vindo do banco. */
/** Mapa das obras. Clicar numa obra avisa quem chamou (a ficha aparece ao lado), sem balão. */
export default function MapaObras({ obras, foco, onSelecionar }: {
  obras: ObraPublica[]; foco?: string | null; onSelecionar?: (codigo: string) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  // O evento de clique é registrado uma vez; a referência garante que ele use a função atual.
  const onSelecionarRef = useRef(onSelecionar);
  onSelecionarRef.current = onSelecionar;

  useEffect(() => {
    let vivo = true;
    estiloBase().then((base) => {
      if (!vivo || !caixa.current) return;
      // As obras já entram no estilo inicial: não dependem do evento "load",
      // que espera todos os blocos do mapa-base e pode não chegar se algum falhar.
      const style: StyleSpecification = {
        ...base,
        // Pontos próximos viram um agrupamento com a contagem; só as linhas não agrupam.
        sources: {
          ...base.sources,
          obras: { type: 'geojson', data: obrasParaGeoJSON([]), cluster: true, clusterRadius: 40, clusterMaxZoom: 14 },
        },
        layers: [
          ...base.layers,
          {
            id: 'obras-linhas', type: 'line', source: 'obras', filter: ['==', ['geometry-type'], 'LineString'],
            layout: { 'line-cap': 'round' },
            paint: { 'line-color': corPorSituacao, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 17, 7] },
          },
          {
            id: 'obras-agrupamentos', type: 'circle', source: 'obras', filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#1d4e5a', 'circle-opacity': 0.85,
              'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
              'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
            },
          },
          {
            id: 'obras-agrupamentos-contagem', type: 'symbol', source: 'obras', filter: ['has', 'point_count'],
            layout: {
              'text-field': ['to-string', ['get', 'point_count']], 'text-font': ['Noto Sans Medium'],
              'text-size': 13, 'text-allow-overlap': true,
            },
            paint: { 'text-color': '#ffffff' },
          },
          {
            id: 'obras-pontos', type: 'circle', source: 'obras',
            filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'point_count']]],
            paint: {
              'circle-color': corPorSituacao, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 8],
              'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
            },
          },
        ],
      };
      const m = new maplibregl.Map({
        container: caixa.current, style, bounds: NITEROI, maxBounds: [[-43.4, -23.2], [-42.7, -22.6]],
        attributionControl: { compact: true }, cooperativeGestures: true,
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      // Bloco do mapa-base que falha não impede o uso; só avisa se o estilo nem carregou.
      m.on('error', (e: maplibregl.ErrorEvent) => {
        if (vivo && !m.isStyleLoaded()) setErro(e.error?.message ?? 'Falha ao carregar o mapa.');
      });
      for (const camada of ['obras-linhas', 'obras-pontos']) {
        m.on('click', camada, (e: maplibregl.MapLayerMouseEvent) => {
          const codigo = e.features?.[0]?.properties?.codigo;
          if (typeof codigo === 'string') onSelecionarRef.current?.(codigo);
        });
        m.on('mouseenter', camada, () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', camada, () => { m.getCanvas().style.cursor = ''; });
      }
      // Clique num agrupamento: aproxima o mapa até ele se separar nas obras.
      m.on('click', 'obras-agrupamentos', (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        const id = f?.properties?.cluster_id;
        const geom = f?.geometry;
        if (typeof id !== 'number' || geom?.type !== 'Point') return;
        const centro = geom.coordinates as [number, number];
        const fonte = m.getSource('obras') as maplibregl.GeoJSONSource;
        void fonte.getClusterExpansionZoom(id).then((zoom) => {
          m.easeTo({ center: centro, zoom });
        }).catch(() => undefined);
      });
      m.on('mouseenter', 'obras-agrupamentos', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'obras-agrupamentos', () => { m.getCanvas().style.cursor = ''; });
      const marcarPronto = () => { if (vivo && m.getSource('obras')) setPronto(true); };
      m.once('style.load', marcarPronto);
      m.once('idle', marcarPronto);
      mapa.current = m;
    }).catch((e) => { if (vivo) setErro(String(e)); });
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; };
  }, []);

  // Atualiza as obras sem recriar o mapa.
  useEffect(() => {
    if (!pronto || !mapa.current) return;
    (mapa.current.getSource('obras') as maplibregl.GeoJSONSource).setData(obrasParaGeoJSON(obras));
  }, [obras, pronto]);

  // Leva o mapa até a obra escolhida na lista.
  useEffect(() => {
    if (!pronto || !mapa.current || !foco) return;
    const o = obras.find((x) => x.codigo === foco);
    if (!o || o.trechos.length === 0) return;
    const pts = o.trechos.flatMap((t) => (t.fim ? [t.inicio, t.fim] : [t.inicio]));
    const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    mapa.current.fitBounds(b, { padding: 80, maxZoom: 17, duration: 600 });
  }, [foco, obras, pronto]);

  // Quantos trechos o mapa recebeu. Também serve de ponto de verificação para os testes de tela.
  const desenhados = obrasParaGeoJSON(obras).features.length;

  return (
    <div className="relative" data-trechos={desenhados}>
      <div ref={caixa} className="h-[60vh] min-h-[360px] w-full overflow-hidden rounded-sm border border-tinta-200 bg-tinta-50"
           role="region" aria-label="Mapa das obras licenciadas em Niterói" />
      {erro && (
        <p role="alert" className="absolute inset-x-3 bottom-3 rounded-sm bg-white/95 px-3 py-2 text-sm text-baixa shadow-sm">
          O mapa não carregou ({erro}). A lista abaixo continua com todas as obras.
        </p>
      )}
    </div>
  );
}
