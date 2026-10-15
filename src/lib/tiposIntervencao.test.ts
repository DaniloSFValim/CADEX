import { describe, expect, it } from 'vitest';
import { codigoDeRotulo, validarNovoTipo } from './tiposIntervencao';

describe('codigoDeRotulo', () => {
  it('tira acento, põe em minúsculas e troca espaço por "_"', () => {
    expect(codigoDeRotulo('Bicicletário')).toBe('bicicletario');
    expect(codigoDeRotulo('Ligação de imóvel')).toBe('ligacao_de_imovel');
  });

  it('não deixa "_" nas pontas nem sequências', () => {
    expect(codigoDeRotulo('  --Caixa   de  -- passagem! ')).toBe('caixa_de_passagem');
  });
});

describe('validarNovoTipo', () => {
  const base = { setor: 'viario' as const, codigo: 'bicicletario', rotulo: 'Bicicletário', fonte: 'Ato nº 1/2026' };

  it('aceita um tipo completo e novo no setor', () => {
    expect(validarNovoTipo(base, ['vala'])).toEqual([]);
  });

  it('recusa telecomunicações, que segue o art. 10', () => {
    const erros = validarNovoTipo({ ...base, setor: 'telecom' }, []);
    expect(erros.join(' ')).toMatch(/art\. 10/);
  });

  it('exige a fonte', () => {
    expect(validarNovoTipo({ ...base, fonte: '  ' }, []).join(' ')).toMatch(/fonte/);
  });

  it('recusa código repetido no mesmo setor', () => {
    expect(validarNovoTipo(base, ['bicicletario']).join(' ')).toMatch(/Já existe/);
  });

  it('não cria "outros" pela tela: ele já existe em cada setor', () => {
    expect(validarNovoTipo({ ...base, codigo: 'outros' }, []).join(' ')).toMatch(/Outros/);
  });

  it('recusa código com maiúscula, número ou espaço', () => {
    expect(validarNovoTipo({ ...base, codigo: 'Bicicletário' }, []).join(' ')).toMatch(/código/);
    expect(validarNovoTipo({ ...base, codigo: 'tipo2' }, []).join(' ')).toMatch(/código/);
  });
});
