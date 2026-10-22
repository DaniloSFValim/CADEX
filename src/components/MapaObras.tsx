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

/** Raio do calor em pixels, igual à expressão do mapa de calor. Usado para contar o que está sob o cursor. */
const RAIO_CALOR = ['interpolate', ['linear'], ['zoom'], 11, 26, 16, 48] as unknown as maplibregl.ExpressionSpecification;
const raioCalorPx = (zoom: number) => Math.min(48, Math.max(26, 26 + ((zoom - 11) * 22) / 5));

/** Raio dos agrupamentos por quantidade de obras. */
const RAIO_AGRUPAMENTO = ['step', ['get', 'point_count'], 16, 10, 20, 50, 26] as unknown as maplibregl.ExpressionSpecification;

/** Cresce os agrupamentos de zero ao tamanho final, em cerca de 0,9 s. Não roda com "reduzir movimento" ativado. */
function crescerAgrupamentos(m: maplibregl.Map) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const inicio = performance.now();
  const passo = (agora: number) => {
    const f = Math.min(1, (agora - inicio) / 900);
    const suave = 1 - Math.pow(1 - f, 3);
    if (!m.getLayer('obras-agrupamentos')) return;
    m.setPaintProperty('obras-agrupamentos', 'circle-radius', ['*', suave, RAIO_AGRUPAMENTO] as unknown as maplibregl.ExpressionSpecification);
    if (f < 1) requestAnimationFrame(passo);
  };
  passo(inicio);
  requestAnimationFrame(passo);
}

const corPorSituacao = [
  'match', ['get', 'situacao'],
  ...(Object.entries(COR_SITUACAO) as [SituacaoPublica, string][]).flat(),
  '#6b7280',
] as unknown as maplibregl.ExpressionSpecification;

/** Mapa das obras. Clicar numa obra avisa quem chamou (a ficha aparece ao lado), sem balão. */
export default function MapaObras({ obras, foco, destaque, modo = 'pontos', bairro, onSelecionar, onBairro, onDestacar }: {
  obras: ObraPublica[]; foco?: string | null; destaque?: string | null; modo?: 'pontos' | 'calor';
  bairro?: string | null; onSelecionar?: (codigo: string) => void; onBairro?: (bairro: string) => void;
  onDestacar?: (codigo: string | null) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  // O evento de clique é registrado uma vez; a referência garante que ele use a função atual.
  const onSelecionarRef = useRef(onSelecionar);
  onSelecionarRef.current = onSelecionar;
  const onBairroRef = useRef(onBairro);
  onBairroRef.current = onBairro;
  const onDestacarRef = useRef(onDestacar);
  onDestacarRef.current = onDestacar;
  // Quem está no mapa, para os balões de informação lerem sempre o valor atual.
  const obrasRef = useRef(obras);
  obrasRef.current = obras;

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
          // Calor e área de toque usam cada obra, sem agrupar: a densidade precisa contar obra por obra.
          brutas: { type: 'geojson', data: obrasParaGeoJSON([]) },
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
              'circle-color': '#0e7482', 'circle-opacity': 0.95,
              'circle-radius': RAIO_AGRUPAMENTO,
              'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3,
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
            // Área da intervenção (polígono desenhado): preenchimento e contorno na cor da situação.
            id: 'obras-areas', type: 'fill', source: 'obras', filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': corPorSituacao, 'fill-opacity': 0.28 },
          },
          {
            id: 'obras-areas-contorno', type: 'line', source: 'obras', filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'line-color': corPorSituacao, 'line-width': 2 },
          },
          {
            // Halo pulsante atrás das obras vigentes: mostra quais trechos estão autorizados agora.
            id: 'obras-vigentes-halo', type: 'circle', source: 'obras',
            filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'point_count']], ['==', ['get', 'situacao'], 'vigente']],
            paint: { 'circle-color': '#1e7b4c', 'circle-radius': 8, 'circle-opacity': 0 },
          },
          {
            // Visão de densidade: onde há mais intervenções. Ligada pelo botão "Mapa de calor".
            id: 'obras-calor', type: 'heatmap', source: 'brutas', filter: ['==', ['geometry-type'], 'Point'],
            layout: { visibility: 'none' },
            paint: {
              'heatmap-weight': 1,
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 1.4, 16, 3.5],
              'heatmap-radius': RAIO_CALOR,
              'heatmap-opacity': 0.85,
              'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(14,116,130,0)', 0.25, '#67c1cf', 0.55, '#f5b841', 1, '#c2410c'] as unknown as maplibregl.ExpressionSpecification,
            },
          },
          {
            // Destaque da obra apontada na lista: contorno escuro por cima do trecho.
            id: 'obras-destaque-linha', type: 'line', source: 'obras', filter: ['==', ['get', 'codigo'], '__nenhum__'],
            layout: { 'line-cap': 'round' },
            paint: { 'line-color': '#0b2530', 'line-width': 9, 'line-opacity': 0.9 },
          },
          {
            id: 'obras-destaque-ponto', type: 'circle', source: 'obras', filter: ['==', ['get', 'codigo'], '__nenhum__'],
            paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 14, 'circle-stroke-color': '#0b2530', 'circle-stroke-width': 3 },
          },
          {
            // Área de toque sobre o calor: invisível, só para clicar e passar o mouse num bairro.
            id: 'obras-calor-toque', type: 'circle', source: 'brutas',
            filter: ['==', ['geometry-type'], 'Point'],
            layout: { visibility: 'none' },
            paint: { 'circle-color': '#000000', 'circle-opacity': 0, 'circle-radius': RAIO_CALOR },
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
      for (const camada of ['obras-linhas', 'obras-pontos', 'obras-areas']) {
        m.on('click', camada, (e: maplibregl.MapLayerMouseEvent) => {
          const codigo = e.features?.[0]?.properties?.codigo;
          if (typeof codigo === 'string') onSelecionarRef.current?.(codigo);
        });
        m.on('mouseenter', camada, () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', camada, () => { m.getCanvas().style.cursor = ''; });
      }
      // Clique num agrupamento: abre o grupo no mapa.
      m.on('click', 'obras-agrupamentos', (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        const id = f?.properties?.cluster_id;
        const geom = f?.geometry;
        if (typeof id !== 'number' || geom?.type !== 'Point') return;
        const centro = geom.coordinates as [number, number];
        const fonte = m.getSource('obras') as maplibregl.GeoJSONSource;
        // Um clique aproxima o mapa até o grupo se separar nos pontos (ou em grupos menores).
        void fonte.getClusterExpansionZoom(id).then((zoom) => {
          m.easeTo({ center: centro, zoom });
        }).catch(() => undefined);
      });
      m.on('mouseenter', 'obras-agrupamentos', () => { m.getCanvas().style.cursor = 'pointer'; });
      // Balão de informação ao passar o mouse: obra, grupo ou área de calor.
      const balao = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'balao-obras' });
      const mostrarObra = (e: maplibregl.MapLayerMouseEvent) => {
        const pr = e.features?.[0]?.properties;
        if (!pr) return;
        const local = [pr.logradouro, pr.bairro].filter((x) => typeof x === 'string' && x).join(', ');
        balao.setLngLat(e.lngLat).setText(`${local || 'Obra'} · nº ${String(pr.numero ?? '')}`).addTo(m);
        // Marca a obra na lista ao lado; ao sair do mapa, a marcação some.
        onDestacarRef.current?.(typeof pr.codigo === 'string' ? pr.codigo : null);
      };
      const sairDaObra = () => { balao.remove(); onDestacarRef.current?.(null); };
      m.on('mousemove', 'obras-pontos', mostrarObra);
      m.on('mousemove', 'obras-linhas', mostrarObra);
      m.on('mouseleave', 'obras-pontos', () => { m.getCanvas().style.cursor = ''; sairDaObra(); });
      m.on('mouseleave', 'obras-linhas', () => { m.getCanvas().style.cursor = ''; sairDaObra(); });
      m.on('mousemove', 'obras-agrupamentos', (e: maplibregl.MapLayerMouseEvent) => {
        const n = Number(e.features?.[0]?.properties?.point_count ?? 0);
        balao.setLngLat(e.lngLat).setText(`${n} obras neste grupo · clique para abrir`).addTo(m);
      });
      m.on('mouseleave', 'obras-agrupamentos', () => { m.getCanvas().style.cursor = ''; balao.remove(); });
      m.on('mousemove', 'obras-calor-toque', (e: maplibregl.MapLayerMouseEvent) => {
        // Conta as obras dentro do mesmo raio que pinta a mancha, não o total do bairro.
        const R = raioCalorPx(m.getZoom());
        const p = e.point;
        const proximas = m.queryRenderedFeatures([[p.x - R, p.y - R], [p.x + R, p.y + R]], { layers: ['obras-calor-toque'] })
          .map((f) => {
            const q = m.project((f.geometry as unknown as { coordinates: [number, number] }).coordinates);
            return { f, d: Math.hypot(q.x - p.x, q.y - p.y) };
          })
          .filter((x) => x.d <= R)
          .sort((a, b) => a.d - b.d);
        const codigos = new Set(proximas.map((x) => String(x.f.properties?.codigo ?? '')).filter(Boolean));
        const bairroDoPonto = String(proximas[0]?.f.properties?.bairro ?? '').trim() || 'Sem bairro';
        const n = codigos.size;
        m.getCanvas().style.cursor = 'pointer';
        balao.setLngLat(e.lngLat).setText(`${bairroDoPonto} · ${n} ${n === 1 ? 'obra nesta área' : 'obras nesta área'} · clique para ampliar`).addTo(m);
      });
      m.on('mouseleave', 'obras-calor-toque', () => { m.getCanvas().style.cursor = ''; balao.remove(); });
      // No calor, o clique aproxima o mapa da área. Não filtra a lista: isso fica com o bairro escolhido na lista.
      m.on('click', 'obras-calor-toque', (e: maplibregl.MapLayerMouseEvent) => {
        m.easeTo({ center: e.lngLat, zoom: Math.min(m.getZoom() + 2, 16) });
      });
      m.on('click', 'obras-pontos', (e: maplibregl.MapLayerMouseEvent) => {
        const b = String(e.features?.[0]?.properties?.bairro ?? '').trim();
        if (b) onBairroRef.current?.(b);
      });
      const marcarPronto = () => { if (vivo && m.getSource('obras')) setPronto(true); };
      m.once('style.load', marcarPronto);
      m.once('idle', marcarPronto);
      mapa.current = m;
    }).catch((e) => { if (vivo) setErro(String(e)); });
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; };
  }, []);

  // Atualiza as obras sem recriar o mapa. Cada mudança de obras faz os agrupamentos crescerem de novo.
  useEffect(() => {
    if (!pronto || !mapa.current) return;
    (mapa.current.getSource('obras') as maplibregl.GeoJSONSource).setData(obrasParaGeoJSON(obras));
    (mapa.current.getSource('brutas') as maplibregl.GeoJSONSource).setData(obrasParaGeoJSON(obras));
    if (obras.length > 0) crescerAgrupamentos(mapa.current);
  }, [obras, pronto]);

  // Halo pulsante das obras vigentes. Com "reduzir movimento", fica parado, em tamanho fixo.
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const PERIODO = 1800;
    let quadro = 0;
    // "zoom" precisa ser a expressão de topo; a escala entra dentro de cada valor do interpolate.
    const raio = (escala: number) => ['interpolate', ['linear'], ['zoom'], 12, 8 * escala, 17, 14 * escala] as unknown as maplibregl.ExpressionSpecification;
    const pintar = (escala: number, opacidade: number) => {
      if (!m.getLayer('obras-vigentes-halo')) return;
      m.setPaintProperty('obras-vigentes-halo', 'circle-radius', raio(escala));
      m.setPaintProperty('obras-vigentes-halo', 'circle-opacity', opacidade);
    };
    if (reduzido) { pintar(1.2, 0.3); return; }
    const passo = (agora: number) => {
      const fase = (agora % PERIODO) / PERIODO;
      pintar(1 + fase * 1.6, 0.5 * (1 - fase));
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [pronto]);

  // Destaque da obra apontada na lista: contorno escuro sobre o trecho dela.
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    const filtro = ['==', ['get', 'codigo'], destaque ?? '__nenhum__'] as unknown as maplibregl.ExpressionSpecification;
    for (const camada of ['obras-destaque-linha', 'obras-destaque-ponto']) {
      if (m.getLayer(camada)) m.setFilter(camada, filtro);
    }
  }, [destaque, pronto]);

  // Pontos ou mapa de calor: a visão de calor esconde os pontos e os agrupamentos.
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    const calor = modo === 'calor';
    const visivel = (ligado: boolean) => (ligado ? 'visible' : 'none') as maplibregl.VisibilitySpecification;
    m.setLayoutProperty('obras-calor', 'visibility', visivel(calor));
    m.setLayoutProperty('obras-calor-toque', 'visibility', visivel(calor));
    for (const camada of ['obras-linhas', 'obras-pontos', 'obras-vigentes-halo', 'obras-agrupamentos',
      'obras-agrupamentos-contagem', 'obras-areas', 'obras-areas-contorno']) {
      if (m.getLayer(camada)) m.setLayoutProperty(camada, 'visibility', visivel(!calor));
    }
  }, [modo, pronto]);

  // Mapa de calor: ao entrar, a mancha cresce até a intensidade final e depois pulsa em ciclo contínuo.
  // A pulsação é uma senoide (sem saltos), recalculada a cerca de 30 quadros por segundo para não pesar o mapa.
  // Com "reduzir movimento", fica parada na intensidade final.
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m || modo !== 'calor' || !m.getLayer('obras-calor')) return;
    // Intensidade na escala do zoom: "zoom" tem de ser a expressão de topo, por isso o fator entra dentro de cada valor.
    const intensidade = (k: number) => ['interpolate', ['linear'], ['zoom'], 11, 1.4 * k, 16, 3.5 * k] as unknown as maplibregl.ExpressionSpecification;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      m.setPaintProperty('obras-calor', 'heatmap-intensity', intensidade(1));
      return;
    }
    const ENTRADA = 1000;
    const CICLO = 5000;
    const AMPLITUDE = 0.12;
    const INTERVALO = 1000 / 30;
    const inicio = performance.now();
    let ultimo = -INTERVALO;
    let quadro = 0;
    const passo = (agora: number) => {
      quadro = requestAnimationFrame(passo);
      if (agora - ultimo < INTERVALO) return;
      ultimo = agora;
      const t = agora - inicio;
      const entrada = Math.min(1, t / ENTRADA);
      const suave = 1 - Math.pow(1 - entrada, 3);
      const pulso = 1 + AMPLITUDE * Math.sin((t / CICLO) * 2 * Math.PI);
      if (m.getLayer('obras-calor')) m.setPaintProperty('obras-calor', 'heatmap-intensity', intensidade(suave * pulso));
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [modo, pronto]);

  // Bairro escolhido (na lista ou no mapa): enquadra as obras dele.
  useEffect(() => {
    if (!pronto || !mapa.current || !bairro) return;
    const pts: [number, number][] = [];
    for (const o of obras) {
      if ((o.trechos[0]?.bairro?.trim() || 'Sem bairro') !== bairro) continue;
      for (const t of o.trechos) pts.push(t.inicio, ...(t.fim ? [t.fim] : []));
    }
    if (pts.length === 0) return;
    const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    mapa.current.fitBounds(b, { padding: 70, maxZoom: 16, duration: 700 });
  }, [bairro, pronto]); // eslint-disable-line react-hooks/exhaustive-deps

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
