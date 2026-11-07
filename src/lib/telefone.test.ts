import { describe, expect, it } from 'vitest';
import { formatTelefone } from './telefone';

describe('formatTelefone', () => {
  it('formata celular com 11 dígitos', () => {
    expect(formatTelefone('21999998888')).toBe('(21) 99999-8888');
  });
  it('formata fixo com 10 dígitos', () => {
    expect(formatTelefone('2133334444')).toBe('(21) 3333-4444');
  });
  it('vai formando enquanto se digita', () => {
    expect(formatTelefone('2')).toBe('(2');
    expect(formatTelefone('21')).toBe('(21');
    expect(formatTelefone('219')).toBe('(21) 9');
    expect(formatTelefone('2199999')).toBe('(21) 9999-9');
  });
  it('ignora caracteres que não são dígitos e limita a 11 dígitos', () => {
    expect(formatTelefone('(21) 99999-8888')).toBe('(21) 99999-8888');
    expect(formatTelefone('219999988889999')).toBe('(21) 99999-8888');
  });
  it('apagar tudo devolve vazio', () => {
    expect(formatTelefone('')).toBe('');
  });
});
