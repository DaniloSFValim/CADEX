import { describe, expect, it } from 'vitest';
import { resumoHistorico, temTendencia } from './historico';
import type { ObraPublica } from './obras';

const obra = (o: Partial<ObraPublica>): ObraPublica => ({
  codigo: 'c', setor: 'telecom', numero: '001/2026', tipos_obra: ['rede'], tipo_intervencao: 'obra', origem: 'concessionaria',
  escopo: 'Rede', inicio_previsto: '2025-03-01', fim_previsto: '2025-04-01', situacao: 'concluida', executora: 'X',
  contratante: null, trechos: [], ...o,
});

describe('resumo do histórico', () => {
  const lista = [
    obra({ codigo: 'a', inicio_previsto: '2024-02-01', origem: 'municipio', tipos_obra: ['rede', 'bicicletario'] }),
    obra({ codigo: 'b', inicio_previsto: '2025-02-01', tipos_obra: ['rede'] }),
    obra({ codigo: 'c', inicio_previsto: '2025-06-01', tipos_obra: ['rede'] }),
    obra({ codigo: 'd', inicio_previsto: '2026-01-10', origem: 'outro_ente', tipos_obra: ['bicicletario'] }),
    obra({ codigo: 'e', inicio_previsto: null, fim_previsto: null, tipos_obra: ['bicicletario'] }),
  ];

  it('separa empresa e órgão público, e conta licenças sem período no total', () => {
    const r = resumoHistorico(lista);
    expect(r.total).toBe(5);
    expect(r.publico).toBe(2);
    expect(r.empresa).toBe(3);
  });

  it('série anual sem pular anos vazios, e quem não tem início fica fora dela', () => {
    const r = resumoHistorico(lista);
    expect(r.anos.map((a) => [a.ano, a.total])).toEqual([[2024, 1], [2025, 2], [2026, 1]]);
    expect(r.anos[0]).toMatchObject({ publico: 1, empresa: 0 });
  });

  it('média conta os anos vazios entre o primeiro e o último', () => {
    const r = resumoHistorico([
      obra({ inicio_previsto: '2024-01-01' }),
      obra({ inicio_previsto: '2026-01-01' }),
    ]);
    expect(r.mediaPorAno).toBeCloseTo(2 / 3);
  });

  it('tipos de obra: uma obra conta uma vez por tipo, do mais frequente', () => {
    const r = resumoHistorico([
      obra({ tipos_obra: ['rede', 'rede', 'bicicletario'] }),
      obra({ tipos_obra: ['rede'] }),
    ]);
    expect(r.tipos).toEqual([{ codigo: 'rede', total: 2 }, { codigo: 'bicicletario', total: 1 }]);
  });

  it('sem licença nenhuma, zera tudo sem erro', () => {
    const r = resumoHistorico([]);
    expect(r).toMatchObject({ total: 0, anos: [], mediaPorAno: 0, anosComDado: 0 });
  });

  it('tendência só com anos suficientes', () => {
    expect(temTendencia(resumoHistorico(lista))).toBe(true);
    expect(temTendencia(resumoHistorico([obra({ inicio_previsto: '2025-01-01' })]))).toBe(false);
  });
});
