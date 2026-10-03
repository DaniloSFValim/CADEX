import { describe, expect, it } from 'vitest';
import { agrupar, gerarPdf, relatorioCsv, totalLinhas, type Relatorio } from './relatorio';

const r: Relatorio = {
  titulo: 'Empresas', arquivo: 'empresas', filtros: ['Tipos: todos'], colunas: ['Código', 'Razão social'],
  grupos: [{ titulo: 'Operadora', linhas: [['OPE-1', 'Claro S.A.']] }, { titulo: 'Terceirizada', linhas: [['TER-1', 'Obras Ltda.'], ['TER-2', 'Cabos']] }],
};

describe('relatório', () => {
  it('agrupa em ordem alfabética, "sem ..." por último, item em mais de um grupo', () => {
    const g = agrupar(['a', 'b', 'c'], (x) => (x === 'a' ? ['Vivo', 'Claro'] : x === 'b' ? ['Sem contratante'] : ['Claro']));
    expect([...g.keys()]).toEqual(['Claro', 'Vivo', 'Sem contratante']);
    expect(g.get('Claro')).toEqual(['a', 'c']);
  });
  it('planilha agrupada leva o grupo na primeira coluna', () => {
    const csv = relatorioCsv(r).replace('﻿', '').split('\r\n');
    expect(csv[0]).toBe('Grupo;Código;Razão social');
    expect(csv[2]).toBe('Terceirizada;TER-1;Obras Ltda.');
    expect(totalLinhas(r)).toBe(3);
  });
  it('sem agrupamento, sem coluna de grupo', () => {
    const csv = relatorioCsv({ ...r, grupos: [{ titulo: '', linhas: [['OPE-1', 'Claro']] }] }).replace('﻿', '');
    expect(csv.startsWith('Código;Razão social')).toBe(true);
  });
  it('gera um PDF', async () => {
    const blob = await gerarPdf(r, 'Danilo', new Date('2026-10-03T12:00:00'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
});
