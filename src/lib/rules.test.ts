import { describe, it, expect } from 'vitest';
import {
  isValidCnpj, isCadexActive, documentHealth, canStartWork,
  isEmergencyLate, daysUntil, statusTone,
} from './rules';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

describe('CNPJ — mesma regra do banco', () => {
  it('aceita CNPJ com dígitos verificadores corretos', () => {
    expect(isValidCnpj('34028316000103')).toBe(true);
    expect(isValidCnpj('34.028.316/0001-03')).toBe(true);
  });
  it('rejeita DV errado, repetição e comprimento inválido', () => {
    expect(isValidCnpj('34028316000104')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('123')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
  });
});

describe('§43 Regra 1/6/8 — habilitação pelo CADEX', () => {
  it('empresa ativa e no prazo está habilitada', () => {
    expect(isCadexActive('ativo', iso(30))).toBe(true);
  });
  it('próximo do vencimento ainda executa', () => {
    expect(isCadexActive('proximo_vencimento', iso(5))).toBe(true);
  });
  it('inapta, vencida ou em análise não executa', () => {
    expect(isCadexActive('inapto', iso(30))).toBe(false);
    expect(isCadexActive('ativo', iso(-1))).toBe(false);
    expect(isCadexActive('em_analise', iso(30))).toBe(false);
    expect(isCadexActive('ativo', null)).toBe(false);
  });
});

describe('§7 — saúde documental', () => {
  it('classifica vencido, vencendo e regular', () => {
    expect(documentHealth(iso(-1))).toBe('vencido');
    expect(documentHealth(iso(10))).toBe('vencendo');
    expect(documentHealth(iso(200))).toBe('ok');
    expect(documentHealth(null)).toBe('sem_validade');
  });
  it('respeita a antecedência configurada', () => {
    expect(documentHealth(iso(45), 60)).toBe('vencendo');
    expect(documentHealth(iso(45), 30)).toBe('ok');
  });
});

describe('§43 Regra 2 — obra exige licença deferida e vigente', () => {
  it('bloqueia sem licença ou com licença vencida', () => {
    expect(canStartWork(null, null)).toBe(false);
    expect(canStartWork('em_analise', iso(10))).toBe(false);
    expect(canStartWork('deferida', iso(-1))).toBe(false);
  });
  it('libera com licença deferida e vigente', () => {
    expect(canStartWork('deferida', iso(10))).toBe(true);
  });
});

describe('§43 Regra 5 — prazo de 24h da emergência', () => {
  const called = new Date(Date.now() - 30 * 3_600_000).toISOString();
  it('acusa atraso quando não regularizada em 24h', () => {
    expect(isEmergencyLate(called, null)).toBe(true);
  });
  it('não acusa atraso quando regularizada dentro do prazo', () => {
    const inTime = new Date(new Date(called).getTime() + 3_600_000).toISOString();
    expect(isEmergencyLate(called, inTime)).toBe(false);
  });
  it('respeita prazo parametrizado', () => {
    expect(isEmergencyLate(called, null, 48)).toBe(false);
  });
});

describe('utilitários de apresentação', () => {
  it('daysUntil é relativo a hoje', () => {
    expect(daysUntil(iso(0))).toBe(0);
    expect(daysUntil(iso(7))).toBe(7);
  });
  it('statusTone separa bom/alerta/ruim', () => {
    expect(statusTone('ativo')).toBe('good');
    expect(statusTone('pendente')).toBe('warn');
    expect(statusTone('inapto')).toBe('bad');
  });
});
