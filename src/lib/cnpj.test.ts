import { describe, expect, it } from 'vitest';
import { formatCnpj, isValidCnpj } from './cnpj';

describe('CNPJ', () => {
  it('aceita CNPJ válido com ou sem pontuação', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('recusa dígito verificador errado, tamanho errado e sequência repetida', () => {
    expect(isValidCnpj('11222333000180')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
  });

  it('formata enquanto digita', () => {
    expect(formatCnpj('11')).toBe('11');
    expect(formatCnpj('11222')).toBe('11.222');
    expect(formatCnpj('11222333')).toBe('11.222.333');
    expect(formatCnpj('112223330001')).toBe('11.222.333/0001');
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnpj('11.222.333/0001-819')).toBe('11.222.333/0001-81');
  });
});
