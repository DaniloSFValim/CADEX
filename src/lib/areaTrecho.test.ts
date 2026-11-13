import { describe, expect, it } from 'vitest';
import { areaParaGeoJson, lerAreaWkb, lerSegmentosWkb, problemaArea, problemaSegmentos, segmentosParaEwkt, segmentosParaGeoJson, type Anel } from './areaTrecho';

// EWKB gerado pelo próprio PostGIS-formato: polígono com SRID 4326 e quatro vértices.
const HEX = '0103000020e610000001000000050000003d0ad7a3708d45c048e17a14aee736c0cdcccccccc8c45c048e17a14aee736c0cdcccccccc8c45c06666666666e636c03d0ad7a3708d45c06666666666e636c03d0ad7a3708d45c048e17a14aee736c0';

describe('área do trecho', () => {
  it('lê o polígono em EWKB e tira o ponto de fechamento', () => {
    expect(lerAreaWkb(HEX)).toEqual([
      [-43.105, -22.905], [-43.1, -22.905], [-43.1, -22.9], [-43.105, -22.9],
    ]);
  });

  it('recusa o que não é polígono ou está vazio', () => {
    expect(lerAreaWkb(null)).toBeNull();
    expect(lerAreaWkb('')).toBeNull();
    // Ponto (tipo 1) com SRID: não é área.
    expect(lerAreaWkb('0101000020e6100000000000000000f03f0000000000000040')).toBeNull();
  });

  it('gera GeoJSON com o anel fechado', () => {
    const anel: Anel = [[-43.105, -22.905], [-43.1, -22.905], [-43.1, -22.9]];
    expect(JSON.parse(areaParaGeoJson(anel))).toEqual({
      type: 'Polygon',
      coordinates: [[[-43.105, -22.905], [-43.1, -22.905], [-43.1, -22.9], [-43.105, -22.905]]],
    });
  });

  it('exige três vértices e pontos dentro de Niterói', () => {
    expect(problemaArea([[-43.1, -22.9], [-43.09, -22.9]])).toMatch(/pelo menos 3/);
    expect(problemaArea([[-43.1, -22.9], [-43.09, -22.9], [-43.09, -22.91]])).toBeNull();
    expect(problemaArea([[-43.1, -22.9], [-44.0, -22.9], [-43.09, -22.91]])).toMatch(/fora de Niterói/);
  });
});

describe('segmentos do trecho', () => {
  // EWKB little-endian de uma MultiLineString com as linhas dadas (sem SRID).
  function wkbMultiLinha(linhas: [number, number][][]): string {
    const bytes: number[] = [];
    const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); bytes.push(...b); };
    const f64 = (n: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, n, true); bytes.push(...b); };
    bytes.push(1); u32(5); u32(linhas.length);
    for (const l of linhas) {
      bytes.push(1); u32(2); u32(l.length);
      for (const [x, y] of l) { f64(x); f64(y); }
    }
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  it('lê as duas linhas de uma MultiLineString em EWKB', () => {
    const hex = wkbMultiLinha([[[-43.12, -22.9], [-43.121, -22.901]], [[-43.13, -22.91], [-43.131, -22.912]]]);
    expect(lerSegmentosWkb(hex)).toEqual([
      [[-43.12, -22.9], [-43.121, -22.901]],
      [[-43.13, -22.91], [-43.131, -22.912]],
    ]);
  });

  it('não lê polígono como segmentos', () => {
    expect(lerSegmentosWkb('0103000000010000000500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000')).toBeNull();
  });

  it('gera GeoJSON MultiLineString', () => {
    const json = JSON.parse(segmentosParaGeoJson([[[-43.12, -22.9], [-43.121, -22.901]]]));
    expect(json).toEqual({ type: 'MultiLineString', coordinates: [[[-43.12, -22.9], [-43.121, -22.901]]] });
  });

  it('recusa lista vazia, ponto fora de Niterói e segmento de comprimento zero', () => {
    expect(problemaSegmentos([])).toMatch(/pelo menos um segmento/);
    expect(problemaSegmentos([[[-43.12, -22.9], [-44.0, -22.9]]])).toMatch(/fora de Niterói/);
    expect(problemaSegmentos([[[-43.12, -22.9], [-43.12, -22.9]]])).toMatch(/mesmo lugar/);
    expect(problemaSegmentos([[[-43.12, -22.9]]])).toMatch(/pelo menos dois pontos/);
    expect(problemaSegmentos([[[-43.12, -22.9], [-43.121, -22.901], [-43.122, -22.902]]])).toBeNull();
    expect(problemaSegmentos([[[-43.12, -22.9], [-43.121, -22.901]]])).toBeNull();
  });
});

describe('EWKT dos segmentos', () => {
  it('monta a MultiLineString com SRID 4326', () => {
    expect(segmentosParaEwkt([[[-43.1, -22.9], [-43.11, -22.91]], [[-43.2, -22.95], [-43.21, -22.96]]])).toBe(
      'SRID=4326;MULTILINESTRING((-43.1 -22.9, -43.11 -22.91), (-43.2 -22.95, -43.21 -22.96))');
  });
});
