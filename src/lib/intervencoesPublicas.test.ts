import { describe, expect, it } from 'vitest';
import { filtrarIntervencoes, intervencoesParaGeoJSON, periodoBR, type IntervencaoPublica } from './intervencoesPublicas';

const base: IntervencaoPublica = {
  id: 'a', categoria: 'sem_licenca', situacao: 'em_execucao', setor: 'telecom', tipo_intervencao: 'obra',
  escopo: 'Troca de rede', tipos_obra: ['vala'], logradouro: 'Rua A', bairro: 'Centro', referencia: null, executora: 'Operadora X',
  inicio_lat: -22.9, inicio_lng: -43.1, fim_lat: null, fim_lng: null,
  inicio_previsto: '2026-11-10', fim_previsto: '2026-11-20',
  processo_sei: null, processo_administrativo: null, contrato_numero: null, ordem_servico_numero: null, foto_url: null, licenca_codigo: null,
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

describe('transparência no cartão', () => {
  it('leva processo administrativo, contrato, ordem de serviço, foto e licença para as propriedades do ponto', () => {
    const fc = intervencoesParaGeoJSON([{
      ...base, processo_sei: null, processo_administrativo: 'PA-1/2026', contrato_numero: 'CT-1',
      ordem_servico_numero: 'OS-1', foto_url: 'https://fotos.example.test/a.jpg', licenca_codigo: 'abc123',
    }]);
    const props = fc.features[0].properties ?? {};
    expect(props.processo).toBe('');
    expect(props.processo_administrativo).toBe('PA-1/2026');
    expect(props.contrato).toBe('CT-1');
    expect(props.ordem_servico).toBe('OS-1');
    expect(props.foto_url).toBe('https://fotos.example.test/a.jpg');
    expect(props.licenca_codigo).toBe('abc123');
  });

  it('linha antiga só com SEI aparece no campo de processo', () => {
    const fc = intervencoesParaGeoJSON([{ ...base, processo_sei: '9900099999/2026', processo_administrativo: null }]);
    expect(fc.features[0].properties?.processo_administrativo).toBe('9900099999/2026');
  });
});

describe('período e contratante no cartão', () => {
  it('formata o período em dd/mm/aaaa e avisa quando falta uma data', () => {
    expect(periodoBR('2026-11-10', '2026-12-20')).toBe('10/11/2026 a 20/12/2026');
    expect(periodoBR('2026-11-10', null)).toBe('10/11/2026 a fim não informado');
    expect(periodoBR(null, null)).toBe('Datas não informadas');
  });

  it('leva o nome do órgão contratante para as propriedades', () => {
    const fc = intervencoesParaGeoJSON([{ ...base, contratante: 'Secretaria de Obras' }]);
    expect(fc.features[0].properties?.contratante).toBe('Secretaria de Obras');
    expect(fc.features[0].properties?.quando).toBe(periodoBR(base.inicio_previsto, base.fim_previsto));
  });
});

describe('galeria no cartão', () => {
  it('leva as imagens para o mapa como texto JSON', () => {
    const fc = intervencoesParaGeoJSON([{ ...base, fotos_imagens: ['https://a.example.test/1.jpg', 'https://a.example.test/2.jpg'] }]);
    expect(JSON.parse(String(fc.features[0].properties?.fotos))).toEqual(['https://a.example.test/1.jpg', 'https://a.example.test/2.jpg']);
  });

  it('sem imagens, a lista vem vazia', () => {
    const fc = intervencoesParaGeoJSON([{ ...base, fotos_imagens: null }]);
    expect(fc.features[0].properties?.fotos).toBe('[]');
  });
});
