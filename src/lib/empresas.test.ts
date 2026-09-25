import { describe, expect, it } from 'vitest';
import {
  estadoDocumento, podeAtuar, resumoDocumentos, situacaoEfetiva, somaDias, ultimoPorTipo,
  type Documento, type TipoDocumento,
} from './empresas';

const HOJE = '2026-09-24';

const tipo = (codigo: string, obrigatorio: boolean, tem_validade: boolean): TipoDocumento =>
  ({ codigo, nome: codigo, fundamento: '', obrigatorio, tem_validade, ordem: 0 });

const doc = (tipo: string, validade: string | null, enviado_em = '2026-09-01T00:00:00Z'): Documento =>
  ({ id: tipo + enviado_em, empresa_id: 'e', tipo, arquivo: '', nome_arquivo: '', validade, enviado_em });

describe('estadoDocumento', () => {
  const certidao = tipo('CND', true, true);

  it('sem arquivo é pendente', () => {
    expect(estadoDocumento(certidao, undefined, HOJE)).toBe('pendente');
  });

  it('documento sem validade está sempre em dia', () => {
    expect(estadoDocumento(tipo('CNPJ', true, false), doc('CNPJ', null), HOJE)).toBe('ok');
  });

  it('vence hoje ainda vale; ontem já venceu', () => {
    expect(estadoDocumento(certidao, doc('CND', HOJE), HOJE)).toBe('vence_em_breve');
    expect(estadoDocumento(certidao, doc('CND', '2026-09-23'), HOJE)).toBe('vencido');
  });

  it('avisa com 30 dias de antecedência', () => {
    expect(estadoDocumento(certidao, doc('CND', '2026-10-24'), HOJE)).toBe('vence_em_breve');
    expect(estadoDocumento(certidao, doc('CND', '2026-10-25'), HOJE)).toBe('ok');
  });
});

describe('somaDias', () => {
  it('atravessa fim de mês e de ano', () => {
    expect(somaDias('2026-09-24', 30)).toBe('2026-10-24');
    expect(somaDias('2026-12-20', 15)).toBe('2027-01-04');
  });
});

describe('ultimoPorTipo e resumoDocumentos', () => {
  it('vale o último envio de cada tipo', () => {
    const antigo = doc('CND', '2026-01-01', '2026-01-01T00:00:00Z');
    const novo = doc('CND', '2027-01-01', '2026-09-01T00:00:00Z');
    expect(ultimoPorTipo([antigo, novo]).get('CND')).toBe(novo);
    expect(ultimoPorTipo([novo, antigo]).get('CND')).toBe(novo);
  });

  it('conta obrigatórios faltando, vencidos e vencendo', () => {
    const tipos = [
      tipo('A', true, false),   // faltando
      tipo('B', true, true),    // vencido
      tipo('C', true, true),    // vencendo
      tipo('D', false, false),  // opcional faltando: não conta
    ];
    const r = resumoDocumentos(tipos, [doc('B', '2026-01-01'), doc('C', '2026-10-01')], HOJE);
    expect(r).toEqual({ faltando: 1, vencidos: 1, vencendo: 1 });
  });
});

describe('situacaoEfetiva', () => {
  it('APTA fora da validade aparece VENCIDA; outras situações não mudam', () => {
    expect(situacaoEfetiva({ situacao: 'apta', validade_ate: '2027-09-20' }, HOJE)).toBe('apta');
    expect(situacaoEfetiva({ situacao: 'apta', validade_ate: '2026-09-23' }, HOJE)).toBe('vencida');
    expect(situacaoEfetiva({ situacao: 'em_saneamento', validade_ate: '2026-09-23' }, HOJE)).toBe('vencida');
    expect(situacaoEfetiva({ situacao: 'inapta', validade_ate: '2026-09-23' }, HOJE)).toBe('inapta');
  });

  it('só APTA e em saneamento podem atuar (arts. 3º e 8º)', () => {
    expect(podeAtuar('apta')).toBe(true);
    expect(podeAtuar('em_saneamento')).toBe(true);
    expect(podeAtuar('em_analise')).toBe(false);
    expect(podeAtuar('vencida')).toBe(false);
  });
});
