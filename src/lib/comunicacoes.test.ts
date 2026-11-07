import { describe, expect, it } from 'vitest';
import { normalizarPlacas, validarComunicacao, type NovaComunicacao } from './comunicacoes';

const base: NovaComunicacao = {
  empresa_id: 'e1', responsavel: 'Fulano', placas: ['ABC1234'], local_servico: 'Rua A',
  descricao: 'Manutenção', inicio_previsto: '2026-12-10', fim_previsto: '2026-12-12',
};
const HOJE = '2026-12-01';

describe('normalizarPlacas', () => {
  it('separa por vírgula, espaço e quebra de linha, e normaliza', () => {
    expect(normalizarPlacas('abc-1234, ABC1D23\nxyz-9999')).toEqual(['ABC1234', 'ABC1D23', 'XYZ9999']);
  });
  it('ignora separadores sobrando', () => {
    expect(normalizarPlacas(' , ,')).toEqual([]);
  });
});

describe('validarComunicacao', () => {
  it('aceita uma comunicação completa com antecedência', () => {
    expect(validarComunicacao(base, HOJE)).toBeNull();
  });
  it('exige responsável', () => {
    expect(validarComunicacao({ ...base, responsavel: '  ' }, HOJE)).toMatch(/responsável/);
  });
  it('exige ao menos uma placa', () => {
    expect(validarComunicacao({ ...base, placas: [] }, HOJE)).toMatch(/placas/);
  });
  it('recusa placa fora do padrão e mostra qual é', () => {
    expect(validarComunicacao({ ...base, placas: ['ABC1234', 'XYZ'] }, HOJE)).toMatch(/XYZ/);
  });
  it('recusa início que já passou, porque o aviso precisa ser prévio', () => {
    expect(validarComunicacao({ ...base, inicio_previsto: '2026-11-30' }, HOJE)).toMatch(/antes do início/);
  });
  it('recusa fim anterior ao início', () => {
    expect(validarComunicacao({ ...base, fim_previsto: '2026-12-09' }, HOJE)).toMatch(/fim/);
  });
});
