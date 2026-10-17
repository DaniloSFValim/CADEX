import { describe, expect, it } from 'vitest';
import { areaParaGeoJson, lerAreaWkb, problemaArea, type Anel } from './areaTrecho';

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
