import { describe, expect, it } from 'vitest';
import { REDES_SIGEO, urlConsultaRede } from './redesSigeo';

describe('urlConsultaRede', () => {
  const agua = REDES_SIGEO.find((r) => r.id === 'rede-agua')!;

  it('pede só a geometria e o OBJECTID, em graus, dentro da área', () => {
    const url = new URL(urlConsultaRede(agua, -43.1, -22.95, -43.05, -22.9));
    expect(url.pathname.endsWith('/FeatureServer/30/query')).toBe(true);
    expect(url.searchParams.get('outFields')).toBe('OBJECTID');
    expect(url.searchParams.get('returnGeometry')).toBe('true');
    expect(url.searchParams.get('geometry')).toBe('-43.1,-22.95,-43.05,-22.9');
    expect(url.searchParams.get('inSR')).toBe('4326');
    expect(url.searchParams.get('outSR')).toBe('4326');
    expect(url.searchParams.get('f')).toBe('geojson');
  });

  it('nenhuma camada pede atributos operacionais', () => {
    for (const r of REDES_SIGEO) {
      const url = new URL(urlConsultaRede(r, 0, 0, 1, 1));
      expect(url.searchParams.get('outFields')).toBe(r.campoId);
      expect(['OBJECTID', 'OBJECTID_1', 'objectid']).toContain(r.campoId);
    }
  });

  it('drenagem é linha, com o campo de id em minúsculas', () => {
    const d = REDES_SIGEO.find((r) => r.id === 'rede-drenagem')!;
    expect(d.tipo).toBe('linha');
    expect(d.campoId).toBe('objectid');
  });

  it('ids das camadas são únicos', () => {
    const ids = REDES_SIGEO.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
