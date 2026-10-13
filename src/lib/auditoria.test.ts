import { describe, expect, it } from 'vitest';
import { camposDoEvento, registroValido, resumoEvento, valorParaTela } from './auditoria';

describe('camposDoEvento', () => {
  it('na alteração, mostra antes e depois dos campos que mudaram', () => {
    const c = camposDoEvento({ operacao: 'UPDATE', antes: { ativo: true, nome: 'A' }, depois: { ativo: false, nome: 'B' } });
    expect(c).toEqual([
      { campo: 'ativo', antes: true, depois: false },
      { campo: 'nome', antes: 'A', depois: 'B' },
    ]);
  });
  it('na alteração, campo que só tem de um lado aparece com o outro vazio', () => {
    expect(camposDoEvento({ operacao: 'UPDATE', antes: null, depois: { x: 1 } })).toEqual([{ campo: 'x', antes: null, depois: 1 }]);
  });
  it('na inclusão e na exclusão, lista só o que está preenchido', () => {
    expect(camposDoEvento({ operacao: 'INSERT', antes: null, depois: { a: 1, b: null, c: '' } }))
      .toEqual([{ campo: 'a', antes: null, depois: 1 }]);
    expect(camposDoEvento({ operacao: 'DELETE', antes: { a: 1, b: null }, depois: null }))
      .toEqual([{ campo: 'a', antes: 1, depois: null }]);
  });
});

describe('resumoEvento', () => {
  it('descreve cada operação', () => {
    expect(resumoEvento({ operacao: 'INSERT', antes: null, depois: { a: 1 } })).toBe('Incluiu o registro');
    expect(resumoEvento({ operacao: 'DELETE', antes: { a: 1 }, depois: null })).toBe('Excluiu o registro');
    expect(resumoEvento({ operacao: 'UPDATE', antes: { a: 1 }, depois: { a: 2 } })).toBe('Alterou: a');
  });
  it('encurta a lista de campos', () => {
    const antes = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 };
    const depois = { a: 2, b: 2, c: 2, d: 2, e: 2, f: 2 };
    expect(resumoEvento({ operacao: 'UPDATE', antes, depois })).toBe('Alterou: a, b, c, d e mais 2');
  });
});

describe('registroValido e valorParaTela', () => {
  it('só aceita código de registro no formato de id', () => {
    expect(registroValido('')).toBe(true);
    expect(registroValido('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(registroValido('abc')).toBe(false);
    expect(registroValido("1' or '1'='1")).toBe(false);
  });
  it('mostra valores de forma legível', () => {
    expect(valorParaTela(null)).toBe('vazio');
    expect(valorParaTela('')).toBe('vazio');
    expect(valorParaTela(true)).toBe('sim');
    expect(valorParaTela(false)).toBe('não');
    expect(valorParaTela(3)).toBe('3');
    expect(valorParaTela({ a: 1 })).toBe('{"a":1}');
    expect(valorParaTela('<script>x</script>')).toBe('<script>x</script>');
  });
});
