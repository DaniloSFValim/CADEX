import { describe, expect, it } from 'vitest';
import { nomeOficialBairro } from './bairros';

describe('grafia oficial do bairro', () => {
  const oficiais = ['Pé Pequeno', "Ponta D'Areia", 'Icaraí'];
  it('troca variações de acento, maiúscula e apóstrofo pela grafia oficial', () => {
    expect(nomeOficialBairro('pe pequeno', oficiais)).toBe('Pé Pequeno');
    expect(nomeOficialBairro(' Ponta Dareia ', oficiais)).toBe("Ponta D'Areia");
    expect(nomeOficialBairro('ICARAI', oficiais)).toBe('Icaraí');
  });
  it('nome fora da lista oficial fica como foi digitado, sem espaços nas pontas', () => {
    expect(nomeOficialBairro('  Vila Nova  ', oficiais)).toBe('Vila Nova');
    expect(nomeOficialBairro('', oficiais)).toBe('');
  });
});
