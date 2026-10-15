import { describe, expect, it } from 'vitest';
import { opcoesCadastro } from './empresas';

const emp = (ativa: boolean, situacao: 'em_analise' | 'deferida' | 'apta') => ({ ativa, situacao });

describe('opcoesCadastro', () => {
  it('empresa em análise, ativa e sem licença: só excluir', () => {
    const o = opcoesCadastro(emp(true, 'em_analise'), 0);
    expect(o).toMatchObject({ desativar: false, reativar: false, excluir: true });
  });

  it('empresa em análise com licença: não exclui, só desativa', () => {
    const o = opcoesCadastro(emp(true, 'em_analise'), 2);
    expect(o).toMatchObject({ desativar: true, excluir: false, motivoSemExclusao: 'Tem licença: só dá para desativar.' });
  });

  it('empresa habilitada e ativa: desativa, não exclui', () => {
    const o = opcoesCadastro(emp(true, 'deferida'), 0);
    expect(o).toMatchObject({ desativar: true, reativar: false, excluir: false });
  });

  it('empresa desativada sem licença: reativa e exclui', () => {
    const o = opcoesCadastro(emp(false, 'deferida'), 0);
    expect(o).toMatchObject({ desativar: false, reativar: true, excluir: true });
  });

  it('empresa desativada com licença: reativa, não exclui', () => {
    const o = opcoesCadastro(emp(false, 'apta'), 3);
    expect(o).toMatchObject({ reativar: true, excluir: false });
  });
});
