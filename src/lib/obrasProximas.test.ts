import { describe, expect, it } from 'vitest';
import { distanciaMetros, obrasProximas, textoDistancia, type ObraPublica } from './obras';

const obra = (codigo: string, lng: number, lat: number): ObraPublica => ({
  codigo, setor: 'viario', numero: '1/2026', tipos_obra: ['vala'], tipo_intervencao: 'obra', origem: 'municipio',
  escopo: 'x', inicio_previsto: '2026-10-01', fim_previsto: '2026-10-30',
  situacao: 'vigente', executora: 'Exec', contratante: 'Cont',
  trechos: [{ logradouro: 'R', bairro: null, inicio: [lng, lat], fim: null }],
} as unknown as ObraPublica);

describe('distanciaMetros', () => {
  it('é zero no mesmo ponto e cresce com a separação', () => {
    expect(distanciaMetros([-43.12, -22.9], [-43.12, -22.9])).toBeCloseTo(0, 6);
    // 0,001 grau de latitude ≈ 111 m
    expect(distanciaMetros([-43.12, -22.9], [-43.12, -22.901])).toBeGreaterThan(100);
    expect(distanciaMetros([-43.12, -22.9], [-43.12, -22.901])).toBeLessThan(120);
  });
});

describe('obrasProximas', () => {
  const eu: [number, number] = [-43.12, -22.9];
  const obras = [obra('longe', -43.10, -22.9), obra('perto', -43.1201, -22.9), obra('meio', -43.115, -22.9)];

  it('ordena pela mais próxima e respeita o limite', () => {
    const r = obrasProximas(obras, eu, 2);
    expect(r.map((x) => x.obra.codigo)).toEqual(['perto', 'meio']);
    expect(r[0].metros).toBeLessThan(r[1].metros);
  });

  it('ignora obra sem localização', () => {
    const semLocal = { ...obra('sem', 0, 0), trechos: [] } as unknown as ObraPublica;
    expect(obrasProximas([semLocal, obras[0]], eu).map((x) => x.obra.codigo)).toEqual(['longe']);
  });
});

describe('textoDistancia', () => {
  it('mostra metros abaixo de 1 km e quilômetros acima', () => {
    expect(textoDistancia(320)).toBe('320 m');
    expect(textoDistancia(1400)).toBe('1,4 km');
  });
});
