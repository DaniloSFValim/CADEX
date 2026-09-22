import { describe, expect, it } from 'vitest';
import {
  approximateLengthM, describeGeometry, firstAndLast, formatLatLng,
  parseLatLng, pointEwkt, toEwkt,
} from './geo';

describe('EWKT — formato em que a geometria chega ao PostGIS', () => {
  it('leva o SRID explícito, sem depender de default', () => {
    expect(toEwkt({ type: 'Point', coordinates: [-43.1036, -22.8832] }))
      .toBe('SRID=4326;POINT(-43.1036 -22.8832)');
  });

  it('converte linha preservando a ordem lng lat', () => {
    expect(toEwkt({ type: 'LineString', coordinates: [[-43.1, -22.9], [-43.2, -22.8]] }))
      .toBe('SRID=4326;LINESTRING(-43.1 -22.9,-43.2 -22.8)');
  });

  it('converte polígono com o anel fechado', () => {
    const g: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[-43.1, -22.9], [-43.2, -22.9], [-43.2, -22.8], [-43.1, -22.9]]],
    };
    expect(toEwkt(g)).toBe(
      'SRID=4326;POLYGON((-43.1 -22.9,-43.2 -22.9,-43.2 -22.8,-43.1 -22.9))',
    );
  });

  it('recusa geometria que a coluna não aceitaria', () => {
    expect(() => toEwkt({ type: 'GeometryCollection', geometries: [] } as GeoJSON.Geometry))
      .toThrow(/não é aceita/);
  });

  it('formata ponto isolado do trecho (art. 2º, VII)', () => {
    expect(pointEwkt({ lng: -43.1018, lat: -22.8815 }))
      .toBe('SRID=4326;POINT(-43.1018 -22.8815)');
  });
});

describe('coordenadas digitadas', () => {
  it('aceita latitude, longitude com vírgula', () => {
    expect(parseLatLng('-22.8832, -43.1036')).toEqual({ lat: -22.8832, lng: -43.1036 });
  });

  it('aceita separação por espaço', () => {
    expect(parseLatLng('-22.8832 -43.1036')).toEqual({ lat: -22.8832, lng: -43.1036 });
  });

  it('recusa valor fora do domínio geográfico', () => {
    expect(parseLatLng('-95, -43')).toBeNull();
    expect(parseLatLng('-22, -200')).toBeNull();
  });

  it('recusa texto incompleto', () => {
    expect(parseLatLng('-22.88')).toBeNull();
    expect(parseLatLng('')).toBeNull();
  });

  it('ida e volta preserva a coordenada', () => {
    const p = { lat: -22.883200, lng: -43.103600 };
    expect(parseLatLng(formatLatLng(p))).toEqual(p);
  });
});

describe('extensão aproximada do traçado', () => {
  it('mede uma linha em metros com ordem de grandeza correta', () => {
    // ~0.01° de latitude ≈ 1,11 km
    const m = approximateLengthM({
      type: 'LineString', coordinates: [[-43.1, -22.88], [-43.1, -22.89]],
    });
    expect(m).toBeGreaterThan(1050);
    expect(m).toBeLessThan(1150);
  });

  it('não estima extensão de ponto', () => {
    expect(approximateLengthM({ type: 'Point', coordinates: [-43.1, -22.88] })).toBeNull();
  });
});

describe('extremos do traçado — apoio ao art. 2º, VII', () => {
  it('devolve primeiro e último vértice da linha', () => {
    const ends = firstAndLast({
      type: 'LineString',
      coordinates: [[-43.10, -22.88], [-43.11, -22.89], [-43.12, -22.90]],
    });
    expect(ends).toEqual([{ lng: -43.10, lat: -22.88 }, { lng: -43.12, lat: -22.90 }]);
  });

  it('não inventa extremos para um ponto', () => {
    expect(firstAndLast({ type: 'Point', coordinates: [-43.1, -22.88] })).toBeNull();
  });
});

describe('descrição da geometria', () => {
  it('conta os vértices da linha', () => {
    expect(describeGeometry({
      type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 2]],
    })).toBe('linha com 3 vértices');
  });

  it('não finge geometria quando não há', () => {
    expect(describeGeometry(null)).toBe('nenhuma geometria definida');
  });
});
