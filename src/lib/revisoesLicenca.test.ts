import { describe, expect, it } from 'vitest';
import { aplicarRevisoes, chaveRevisao, type RevisaoLicenca } from './revisoesLicenca';
import type { Inconsistencia } from './admin';

const lic = (id: string) => ({ id } as unknown as Inconsistencia['licenca']);
const itens: Inconsistencia[] = [
  { licenca: lic('a'), problemas: ['Fim da obra ou serviço vencido, sem conclusão registrada.', 'Trecho sem bairro.'] },
  { licenca: lic('b'), problemas: ['Trecho sem bairro.'] },
];
const rev = (licenca_id: string, aviso: string): RevisaoLicenca =>
  ({ id: 'x', licenca_id, aviso, motivo: 'motivo', revisado_por: null, revisado_em: '2026-11-16' });

describe('revisão de pendências', () => {
  it('tira o aviso aceito e mantém os demais', () => {
    const r = aplicarRevisoes(itens, [rev('a', 'Trecho sem bairro.')]);
    expect(r).toHaveLength(2);
    expect(r[0].problemas).toEqual(['Fim da obra ou serviço vencido, sem conclusão registrada.']);
  });

  it('a licença sai da lista quando não sobra aviso', () => {
    const r = aplicarRevisoes(itens, [rev('b', 'Trecho sem bairro.')]);
    expect(r.map((i) => i.licenca.id)).toEqual(['a']);
  });

  it('aviso aceito em uma licença não vale para outra', () => {
    const r = aplicarRevisoes(itens, [rev('a', 'Trecho sem bairro.')]);
    expect(r.find((i) => i.licenca.id === 'b')?.problemas).toEqual(['Trecho sem bairro.']);
  });

  it('chave combina licença e texto do aviso', () => {
    expect(chaveRevisao('a', 'x')).not.toBe(chaveRevisao('a', 'y'));
  });
});
