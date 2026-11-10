import { describe, expect, it } from 'vitest';
import { empresasAutorizadas, relatorioDiarioOficial } from './diarioOficial';
import { relatorioMarkdown } from './relatorio';
import type { Empresa } from './empresas';

const emp = (o: Partial<Empresa>): Empresa => ({
  id: 'x', codigo_cadex: 'CADEX-X', razao_social: 'Razão', nome_fantasia: null, cnpj: '11222333000181', tipo: 'operadora',
  setores: ['telecom'], situacao: 'deferida', ativa: true, validade_ate: null, portaria: null, portaria_data: null,
  executa_obras: true, ...o,
} as Empresa);

const HOJE = '2026-11-09';

describe('empresasAutorizadas', () => {
  it('inclui deferida, apta e em saneamento, ativas', () => {
    const lista = [emp({ id: 'a', situacao: 'deferida' }), emp({ id: 'b', situacao: 'apta', validade_ate: '2027-01-01' }),
      emp({ id: 'c', situacao: 'em_saneamento', validade_ate: '2027-01-01' })];
    expect(empresasAutorizadas(lista, HOJE).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
  it('exclui inativa, em análise, inapta e apta vencida', () => {
    const lista = [emp({ id: 'a', ativa: false }), emp({ id: 'b', situacao: 'em_analise' }),
      emp({ id: 'c', situacao: 'inapta' }), emp({ id: 'd', situacao: 'apta', validade_ate: '2026-01-01' })];
    expect(empresasAutorizadas(lista, HOJE)).toEqual([]);
  });
  it('exclui empresa de teste, mesmo deferida e ativa', () => {
    const lista = [emp({ id: 'a', teste: false }), emp({ id: 'b', teste: true })];
    expect(empresasAutorizadas(lista, HOJE).map((e) => e.id)).toEqual(['a']);
  });
});

describe('relatorioMarkdown', () => {
  it('monta título, tabela e total, escapando barras nas células', () => {
    const r = relatorioDiarioOficial([emp({ razao_social: 'A | B Ltda.' })], {
      hoje: HOJE, porId: new Map(), vinculos: [],
    });
    const md = relatorioMarkdown(r, 'Servidor', new Date('2026-11-09T12:00:00Z'));
    expect(md.startsWith('# Empresas autorizadas a executar obras e serviços em vias públicas')).toBe(true);
    expect(md).toContain('A \\| B Ltda.');
    expect(md).toContain('| --- |');
    expect(md).toContain('1 registro.');
  });
});

describe('dados publicáveis (LGPD)', () => {
  it('a relação do Diário Oficial não traz contato, representante nem responsável técnico', () => {
    const r = relatorioDiarioOficial([emp({})], { hoje: HOJE, porId: new Map(), vinculos: [] });
    const proibidas = ['e-mail', 'telefone', 'endereço', 'representante', 'responsável técnico', 'Representante', 'Responsável técnico'];
    for (const coluna of r.colunas) {
      for (const p of proibidas) expect(coluna.toLowerCase()).not.toContain(p.toLowerCase());
    }
  });
});
