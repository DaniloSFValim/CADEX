import { describe, expect, it } from 'vitest';
import { erroCorrecao, erroMotivo, resumoCorrecao } from './correcaoLicencas';

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

describe('resumo de uma correção', () => {
  it('lista só os campos que mudaram', () => {
    expect(resumoCorrecao({
      antes: { numero: '084/2024', processo_sei: '990084141/2024' },
      depois: { numero: '084/2024', processo_sei: '99008414/2024' },
    })).toEqual(['SEI: 990084141/2024 → 99008414/2024']);
  });
  it('número que estava vazio aparece como vazio', () => {
    expect(resumoCorrecao({
      antes: { numero: null, processo_sei: '1/2024' },
      depois: { numero: '001/2024', processo_sei: '1/2024' },
    })).toEqual(['Número: vazio → 001/2024']);
  });
});
