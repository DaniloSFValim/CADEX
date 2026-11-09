import { describe, expect, it } from 'vitest';
import { filtrarComunicacoes, hojeNiteroi, naJanela, type ComunicacaoPublica } from './comunicacoesPublicas';

type Base = Omit<ComunicacaoPublica, 'tipo' | 'inicio_previsto' | 'fim_previsto'>;

const base: Base = {
  id: 'x', razao_social: 'Empresa', codigo_cadex: 'CADEX-OPE-2026-0001', tipo_servico: null, descricao: '', local_servico: 'Rua',
  placas: [], inicio_lat: -22.9, inicio_lng: -43.1, fim_lat: null, fim_lng: null, ocorrido_em: null, comunicado_em: '2026-11-01T10:00:00Z',
};

function programado(inicio: string, fim: string): ComunicacaoPublica {
  return { ...base, tipo: 'programado', inicio_previsto: inicio, fim_previsto: fim };
}
function emergencia(inicio: string, fim: string): ComunicacaoPublica {
  return { ...base, tipo: 'emergencia', inicio_previsto: inicio, fim_previsto: fim };
}

const HOJE = '2026-11-09';

describe('hojeNiteroi', () => {
  it('usa o dia em Brasília mesmo quando já é outro dia em UTC', () => {
    // 2026-11-10 02:30 UTC = 2026-11-09 23:30 em Brasília.
    expect(hojeNiteroi(new Date('2026-11-10T02:30:00Z'))).toBe('2026-11-09');
  });
});

describe('filtro padrão do mapa: só o que acontece hoje', () => {
  it('mostra o programado de hoje e não o de amanhã', () => {
    const lista = [programado(HOJE, HOJE), programado('2026-11-10', '2026-11-10')];
    expect(filtrarComunicacoes(lista, false, HOJE)).toEqual([lista[0]]);
  });

  it('mostra um trecho que começa antes e termina depois de hoje', () => {
    const lista = [programado('2026-11-07', '2026-11-12')];
    expect(filtrarComunicacoes(lista, false, HOJE)).toEqual(lista);
  });

  it('a emergência de ontem some do padrão', () => {
    const lista = [emergencia('2026-11-08', '2026-11-08')];
    expect(filtrarComunicacoes(lista, false, HOJE)).toEqual([]);
  });
});

describe('filtro ampliado: janela de 15 dias', () => {
  it('programado: de hoje até 15 dias à frente', () => {
    expect(naJanela(programado(HOJE, HOJE), HOJE)).toBe(true);
    expect(naJanela(programado('2026-11-24', '2026-11-24'), HOJE)).toBe(true);
    expect(naJanela(programado('2026-11-25', '2026-11-25'), HOJE)).toBe(false);
  });

  it('emergência: de 15 dias atrás até hoje', () => {
    expect(naJanela(emergencia('2026-10-25', '2026-10-25'), HOJE)).toBe(true);
    expect(naJanela(emergencia('2026-10-24', '2026-10-24'), HOJE)).toBe(false);
    expect(naJanela(emergencia('2026-11-10', '2026-11-10'), HOJE)).toBe(false);
  });

  it('o filtro ampliado inclui o que o padrão esconde', () => {
    const lista = [programado('2026-11-15', '2026-11-15'), emergencia('2026-11-05', '2026-11-05')];
    expect(filtrarComunicacoes(lista, false, HOJE)).toEqual([]);
    expect(filtrarComunicacoes(lista, true, HOJE)).toEqual(lista);
  });
});
