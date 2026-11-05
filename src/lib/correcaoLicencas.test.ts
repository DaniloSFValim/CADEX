import { describe, expect, it } from 'vitest';
import { erroCorrecao, erroMotivo } from './correcaoLicencas';

describe('erroCorrecao', () => {
  it('aceita número e processo no padrão', () => {
    expect(erroCorrecao({ numero: '012/2026' })).toBeNull();
    expect(erroCorrecao({ processo_sei: '040001938/2022' })).toBeNull();
  });
  it('recusa número fora do padrão 000/AAAA', () => {
    expect(erroCorrecao({ numero: '12/2026' })).toBe('Número no padrão 000/AAAA.');
    expect(erroCorrecao({ numero: '012-2026' })).toBe('Número no padrão 000/AAAA.');
  });
  it('recusa processo SEI sem barra e ano', () => {
    expect(erroCorrecao({ processo_sei: '040001938' })).toBe('Processo SEI no padrão 000000000/AAAA.');
  });
  it('exige ao menos um campo', () => {
    expect(erroCorrecao({ numero: '  ', processo_sei: '' })).toBe('Informe o número ou o processo SEI.');
  });
});

describe('erroMotivo', () => {
  it('exige ao menos 10 caracteres, sem contar espaços das pontas', () => {
    expect(erroMotivo('   curto   ')).toBe('Informe o motivo (ao menos 10 caracteres).');
    expect(erroMotivo('digitado errado no SEI')).toBeNull();
  });
});
