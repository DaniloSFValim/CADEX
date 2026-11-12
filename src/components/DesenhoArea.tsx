import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { estiloBase } from './MapaObras';
import { problemaArea, type Anel, type Segmento } from '../lib/areaTrecho';
import { Button } from './ui';
import { MAPA_LOCALE } from '../lib/mapaLocale';

export type TipoTrecho = 'ponto' | 'segmento' | 'area';
type Ponto = [number, number]; // [longitude, latitude]

/** Centro e limites de Niterói, como no mapa público. */
const NITEROI: maplibregl.LngLatBoundsLike = [[-43.135, -22.995], [-42.955, -22.865]];

/**
 * Marcação de um trecho no mapa, conforme o tipo escolhido:
 * - ponto: cada clique põe o ponto de início;
 * - segmento: o primeiro clique é o início e o segundo, o fim;
 * - área: cada clique acrescenta um vértice (o polígono se forma com três).
 * O formulário guarda os valores; o mapa só mostra o que o formulário tem.
 */
/**
 * Com "segmentos" informado (só o formulário de licença), o tipo segmento marca vários trechos
 * de rua no mesmo trecho: cada par de cliques é um segmento, e o próximo clique começa outro.
 */
export default function DesenhoArea({ tipo, inicio, fim, area, segmentos, rascunho = [], onChange, ro }: {
  tipo: TipoTrecho; inicio: Ponto | null; fim: Ponto | null; area: Anel | null;
  segmentos?: Segmento[]; rascunho?: Ponto[];
  onChange: (p: { inicio?: Ponto | null; fim?: Ponto | null; area?: Anel | null; segmentos?: Segmento[]; rascunho?: Ponto[] }) => void;
  ro: boolean;
}) {
  const multi = tipo === 'segmento' && segmentos !== undefined;
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const pronto = useRef(false);
  // O evento de clique é registrado uma vez: a referência garante que ele use o valor atual.
  const atual = useRef({ tipo, inicio, fim, area, segmentos, rascunho, multi, onChange, ro });
  atual.current = { tipo, inicio, fim, area, segmentos, rascunho, multi, onChange, ro };

  useEffect(() => {
    let vivo = true;
    estiloBase().then((base) => {
      if (!vivo || !caixa.current) return;
      const m = new maplibregl.Map({
        container: caixa.current, style: base, bounds: NITEROI, maxBounds: [[-43.4, -23.2], [-42.7, -22.6]],
        attributionControl: { compact: true }, cooperativeGestures: true, locale: MAPA_LOCALE,
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      m.on('load', () => {
        m.addSource('marcas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'marcas-area', type: 'fill', source: 'marcas', filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': '#d9780a', 'fill-opacity': 0.3 } });
        m.addLayer({ id: 'marcas-linha', type: 'line', source: 'marcas', filter: ['==', ['geometry-type'], 'LineString'],
          paint: { 'line-color': '#b85f06', 'line-width': 3 } });
        m.addLayer({ id: 'marcas-pontos', type: 'circle', source: 'marcas', filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#b85f06', 'circle-stroke-width': 2.5 } });
        pronto.current = true;
        desenhar();
      });
      m.on('click', (e: maplibregl.MapMouseEvent) => {
        const v = atual.current;
        if (v.ro) return;
        const c: Ponto = [e.lngLat.lng, e.lngLat.lat];
        if (v.tipo === 'ponto') v.onChange({ inicio: c, fim: null });
        else if (v.multi) {
          // Como no Google Earth: cada clique acrescenta um ponto ao traçado; "Concluir segmento" o fecha.
          v.onChange({ rascunho: [...(v.rascunho ?? []), c] });
        } else if (v.tipo === 'segmento') {
          // O primeiro clique põe o início; o segundo, o fim; um novo ciclo recomeça no início.
          if (!v.inicio || v.fim) v.onChange({ inicio: c, fim: null });
          else v.onChange({ fim: c });
        } else {
          const anel = [...(v.area ?? []), c];
          // A área também define o início do trecho: o primeiro vértice.
          v.onChange({ area: anel, inicio: anel[0] });
        }
      });
      mapa.current = m;
    }).catch(() => undefined);
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; pronto.current = false; };
  }, []);

  // Redesenha sempre que o formulário muda a marcação.
  useEffect(() => { desenhar(); }, [tipo, inicio, fim, area, segmentos, rascunho]);

  // Lê a marcação pela referência: o mapa carrega depois dos dados, e a função registrada no
  // carregamento desenharia a marcação da primeira renderização, já vencida.
  function desenhar() {
    const { tipo, inicio, fim, area, segmentos, rascunho, multi } = atual.current;
    const m = mapa.current;
    if (!m || !pronto.current) return;
    const fonte = m.getSource('marcas') as maplibregl.GeoJSONSource | undefined;
    if (!fonte) return;
    const features: GeoJSON.Feature[] = [];
    const ponto = (c: Ponto): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } });
    if (multi) {
      for (const seg of segmentos ?? []) {
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: seg } });
        for (const c of seg) features.push(ponto(c));
      }
      if ((rascunho?.length ?? 0) >= 2) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: rascunho as Ponto[] } });
      for (const c of rascunho ?? []) features.push(ponto(c));
    } else if (tipo === 'area') {
      for (const c of area ?? []) features.push(ponto(c));
      if ((area?.length ?? 0) >= 3) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...(area as Anel), (area as Anel)[0]]] } });
    } else {
      if (inicio) features.push(ponto(inicio));
      if (tipo === 'segmento' && fim) features.push(ponto(fim));
      if (tipo === 'segmento' && inicio && fim) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [inicio, fim] } });
    }
    fonte.setData({ type: 'FeatureCollection', features });
  }

  const erro = tipo === 'area' ? problemaArea(area ?? []) : null;
  const qtdSegmentos = segmentos?.length ?? 0;
  const instrucao = tipo === 'ponto'
    ? (inicio ? 'Ponto marcado. Clique de novo para trocar.' : 'Clique no mapa para marcar o ponto.')
    : multi
      ? (rascunho.length === 0
          ? (qtdSegmentos
            ? `${qtdSegmentos} segmento${qtdSegmentos === 1 ? '' : 's'} concluído${qtdSegmentos === 1 ? '' : 's'}. Clique para começar outro.`
            : 'Clique no primeiro ponto do segmento.')
          : `${rascunho.length} ponto${rascunho.length === 1 ? '' : 's'} neste segmento. ${rascunho.length >= 2
            ? 'Clique para acrescentar mais, ou em Concluir segmento.'
            : 'Precisa de pelo menos dois pontos.'}`)
    : tipo === 'segmento'
      ? (!inicio ? 'Clique no início do trecho.' : !fim ? 'Clique no fim do trecho.' : 'Trecho marcado. Clique de novo para começar outro.')
      : (area?.length ? `${area.length} vértice${area.length === 1 ? '' : 's'} marcado${area.length === 1 ? '' : 's'}.` : 'Clique nos cantos da área.');

  return (
    <div className="desenho-area flex flex-col gap-3">
      <div ref={caixa} className="h-[360px] w-full overflow-hidden rounded-sm border border-tinta-200 bg-tinta-50"
           role="region" aria-label="Mapa para marcar o trecho" />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-tinta-600" aria-live="polite">
          {instrucao}
          {tipo === 'area' && erro && (area?.length ?? 0) > 0 && <span className="ml-2 text-atencao">{erro}</span>}
        </span>
        {!ro && tipo === 'area' && (area?.length ?? 0) > 0 && (
          <>
            <Button variant="secondary" className="px-3! py-1.5!"
                    onClick={() => onChange({ area: area && area.length > 1 ? area.slice(0, -1) : null, inicio: area && area.length > 1 ? area[0] : null })}>
              Desfazer último ponto
            </Button>
            <Button variant="secondary" className="px-3! py-1.5!" onClick={() => onChange({ area: null, inicio: null })}>
              Limpar área
            </Button>
          </>
        )}
        {!ro && multi && (qtdSegmentos > 0 || rascunho.length > 0) && (
          <>
            {rascunho.length >= 2 && (
              <Button variant="primary" className="px-3! py-1.5!"
                      onClick={() => onChange({ segmentos: [...(segmentos ?? []), rascunho as Ponto[]], rascunho: [] })}>
                Concluir segmento
              </Button>
            )}
            {rascunho.length > 0 && (
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => onChange({ rascunho: rascunho.slice(0, -1) })}>
                Desfazer último ponto
              </Button>
            )}
            {rascunho.length > 0 && (
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => onChange({ rascunho: [] })}>
                Cancelar segmento
              </Button>
            )}
            {rascunho.length === 0 && qtdSegmentos > 0 && (
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => onChange({ segmentos: (segmentos ?? []).slice(0, -1) })}>
                Desfazer último segmento
              </Button>
            )}
            <Button variant="secondary" className="px-3! py-1.5!" onClick={() => onChange({ segmentos: [], rascunho: [] })}>
              Limpar segmentos
            </Button>
          </>
        )}
        {!ro && !multi && tipo !== 'area' && (inicio || fim) && (
          <Button variant="secondary" className="px-3! py-1.5!" onClick={() => onChange({ inicio: null, fim: null })}>
            Limpar marcação
          </Button>
        )}
      </div>
    </div>
  );
}
