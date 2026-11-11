import { describe, expect, it } from 'vitest';
import { errorMessage } from './ui';

describe('errorMessage', () => {
  it('traduz a falha de rede em vez de mostrar o texto técnico do navegador', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/Sem conexão/);
    expect(errorMessage({ message: 'NetworkError when attempting to fetch resource.' })).toMatch(/Sem conexão/);
  });
  it('avisa da sessão expirada', () => {
    expect(errorMessage({ message: 'JWT expired', code: 'PGRST301' })).toMatch(/sessão expirou/);
  });
  it('só fala em CNPJ quando a duplicidade é do CNPJ', () => {
    expect(errorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "empresas_cnpj_key"' }))
      .toBe('Já existe uma empresa cadastrada com este CNPJ.');
    const numero = errorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "licencas_numero_ativo"' });
    expect(numero).not.toMatch(/CNPJ/);
    expect(numero).toMatch(/licença ativa com este número/);
    const outra = errorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "vinculos_unico"' });
    expect(outra).not.toMatch(/CNPJ/);
    expect(outra).toMatch(/Já existe um registro/);
  });
  it('mantém a mensagem que o banco escreveu para o usuário', () => {
    expect(errorMessage({ message: 'Informe o número da licença.' })).toBe('Informe o número da licença.');
    expect(errorMessage(null)).toBe('');
    expect(errorMessage({})).toBe('Erro inesperado.');
  });
});
