import { describe, expect, it } from 'vitest';
import { filtrarIntervencoes, intervencoesParaGeoJSON, type IntervencaoPublica } from './intervencoesPublicas';

const base: IntervencaoPublica = {
  id: 'a', categoria: 'sem_licenca', situacao: 'em_execucao', setor: 'telecom', tipo_intervencao: 'obra',
  escopo: 'Troca de rede', tipos_obra: ['vala'], logradouro: 'Rua A', bairro: 'Centro', referencia: null, executora: 'Operadora X',
  inicio_lat: -22.9, inicio_lng: -43.1, fim_lat: null, fim_lng: null,
  inicio_previsto: '2026-11-10', fim_previsto: '2026-11-20',
};

const HOJE = '2026-11-12';

describe('intervencoesParaGeoJSON', () => {
  it('gera ponto e trecho e rotula cada categoria', () => {
    const lista: IntervencaoPublica[] = [
      { ...base, id: 'c1', fim_lat: -22.91, fim_lng: -43.11 },
      { ...base, id: 'p1', categoria: 'publica', executora: null },
    ];
    const fc = intervencoesParaGeoJSON(lista);
    expect(fc.features).toHaveLength(3);
    const [, trecho, publica] = fc.features;
    expect(trecho.properties?.rotulo).toBe('Obra ou serviço sem licença');
    expect(publica.properties?.rotulo).toBe('Obra pública sem licença');
    expect(publica.properties?.empresa).toBe('Execução própria do órgão público');
  });

  it('ignora quem não tem ponto de início', () => {
    const fc = intervencoesParaGeoJSON([{ ...base, inicio_lat: null, inicio_lng: null }]);
    expect(fc.features).toHaveLength(0);
  });
});

describe('filtrarIntervencoes', () => {
  it('mostra a de empresa só enquanto acontece hoje, mas a pública sempre', () => {
    const futura = { ...base, id: 'f', inicio_previsto: '2026-11-14', fim_previsto: '2026-11-20' };
    const publicaEncerrada = { ...base, id: 'p', categoria: 'publica' as const, fim_previsto: '2026-10-01' };
    const lista = [base, futura, publicaEncerrada];
    expect(filtrarIntervencoes(lista, false, HOJE).map((i) => i.id)).toEqual(['a', 'p']);
  });

  it('com o filtro ampliado, mostra a empresa dentro da janela que a view já aplicou', () => {
    const futura = { ...base, id: 'f', inicio_previsto: '2026-11-14', fim_previsto: '2026-11-20' };
    expect(filtrarIntervencoes([futura], true, HOJE)).toHaveLength(1);
  });
});
