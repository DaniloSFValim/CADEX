import { describe, expect, it } from 'vitest';
import { celulaCsv, gerarCsv, relacaoCsv } from './exportar';
import type { Empresa } from './empresas';

const base = {
  id: 'a', codigo_cadex: 'CADEX-OPE-2026-0001', cnpj: '11222333000181', razao_social: 'Op; "Teste" S.A.',
  nome_fantasia: null, tipo: 'operadora', email: 'op@t.test', telefone: null, cep: null, logradouro: null,
  numero: null, complemento: null, bairro: null, cidade: null, uf: null, observacoes: null,
  situacao: 'apta', processo_numero: null, data_requerimento: null, portaria_numero: 'P 1/2026',
  portaria_data: '2026-09-20', validade_ate: '2027-09-20', notificacao_data: null, logo_arquivo: null,
  criado_em: '', atualizado_em: '',
} as Empresa;

describe('CSV', () => {
  it('aspas só quando precisa', () => {
    expect(celulaCsv('simples')).toBe('simples');
    expect(celulaCsv('a;b')).toBe('"a;b"');
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
  });

  it('neutraliza fórmula (CSV injection)', () => {
    expect(celulaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celulaCsv('+55 21')).toBe("'+55 21");
    expect(celulaCsv('@cmd')).toBe("'@cmd");
  });

  it('BOM, separador ; e CRLF para o Excel', () => {
    expect(gerarCsv(['A', 'B'], [['1', '2']])).toBe('﻿A;B\r\n1;2\r\n');
  });

  it('relação traz só as colunas escolhidas, na ordem do catálogo', () => {
    const csv = relacaoCsv([base], ['validade', 'codigo', 'situacao'], {
      hoje: '2026-09-25', porId: new Map([[base.id, base]]), vinculos: [],
    });
    expect(csv).toBe('﻿Código CADEX;Situação;Válida até\r\nCADEX-OPE-2026-0001;APTA;20/09/2027\r\n');
  });

  it('situação exportada é a efetiva (VENCIDA)', () => {
    const csv = relacaoCsv([base], ['situacao'], { hoje: '2027-10-01', porId: new Map(), vinculos: [] });
    expect(csv).toContain('VENCIDA');
  });
});
