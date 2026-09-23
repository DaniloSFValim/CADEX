import { describe, expect, it } from 'vitest';
import { defaultValidUntil, obraPhase, servicoPhase } from './telecom';

describe('situação da obra', () => {
  it('sem início real, está programada', () => {
    expect(obraPhase({ started_at: null, finished_at: null })).toBe('programada');
  });
  it('iniciada e não concluída, está em andamento', () => {
    expect(obraPhase({ started_at: '2026-09-23T10:00:00Z', finished_at: null })).toBe('em_andamento');
  });
  it('com término real, está concluída', () => {
    expect(obraPhase({ started_at: '2026-09-23T10:00:00Z', finished_at: '2026-09-24T10:00:00Z' }))
      .toBe('concluida');
  });
});

describe('situação do serviço de rotina', () => {
  it('segue a declaração', () => {
    expect(servicoPhase('registrada')).toBe('programada');
    expect(servicoPhase('em_execucao')).toBe('em_andamento');
    expect(servicoPhase('encerrada')).toBe('concluida');
    expect(servicoPhase('cancelada')).toBe('cancelada');
  });
  it('sem declaração, conta como programado', () => {
    expect(servicoPhase(undefined)).toBe('programada');
  });
});

describe('validade do cadastro feito pela Prefeitura', () => {
  it('é de 12 meses', () => {
    expect(defaultValidUntil(new Date('2026-09-23T12:00:00Z'))).toBe('2027-09-23');
  });
});
