import { describe, expect, it } from 'vitest';
import { anosDasObras, filtrarObras, obrasParaGeoJSON, temLocalizacao, type ObraPublica } from './obras';

const obra = (o: Partial<ObraPublica>): ObraPublica => ({
  codigo: 'c1', setor: 'telecom', numero: '001/2026', tipos_obra: ['vala'], tipo_intervencao: 'obra', origem: 'concessionaria', escopo: 'Rede', inicio_previsto: '2026-10-01',
  fim_previsto: '2026-10-30', decisao_data: '2026-09-20', situacao: 'vigente', executora: 'Rede Fibra',
  contratante: 'Oi', trechos: [{ logradouro: 'Rua Mem de Sá', bairro: 'Icaraí', inicio: [-43.11, -22.905], fim: null }],
  ...o,
});

const obras = [
  obra({}),
  obra({ codigo: 'c2', numero: '045/2022', decisao_data: '2022-03-20', situacao: 'concluida', executora: 'Antiga Ltda.',
         trechos: [{ logradouro: 'Rua da Conceição', bairro: 'Centro', inicio: [-43.12, -22.89], fim: [-43.121, -22.891] }] }),
  obra({ codigo: 'c3', numero: '050/2026', situacao: 'aguardando_inicio' }),
  obra({ codigo: 'c4', numero: '060/2025', decisao_data: '2025-05-01', situacao: 'cancelada' }),
];

describe('filtro do mapa', () => {
  it('abre nas vigentes e a começar', () => {
    expect(filtrarObras(obras, { situacao: 'vigentes', ano: '', busca: '' }).map((o) => o.codigo)).toEqual(['c1', 'c3']);
  });
  it('mostra todas, por ano e por busca', () => {
    expect(filtrarObras(obras, { situacao: 'todas', ano: '', busca: '' })).toHaveLength(4);
    expect(filtrarObras(obras, { situacao: 'todas', ano: '2022', busca: '' }).map((o) => o.codigo)).toEqual(['c2']);
    expect(filtrarObras(obras, { situacao: 'todas', ano: '', busca: 'conceição' }).map((o) => o.codigo)).toEqual(['c2']);
    expect(filtrarObras(obras, { situacao: 'todas', ano: '', busca: 'antiga' }).map((o) => o.codigo)).toEqual(['c2']);
  });
  it('lista os anos de emissão, do mais recente', () => {
    expect(anosDasObras(obras)).toEqual(['2026', '2025', '2022']);
  });
});

describe('GeoJSON do mapa', () => {
  it('trecho com fim vira linha; sem fim, ponto; em [lng, lat]', () => {
    const fc = obrasParaGeoJSON(obras.slice(0, 2));
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [-43.11, -22.905] });
    expect(fc.features[1].geometry).toEqual({ type: 'LineString', coordinates: [[-43.12, -22.89], [-43.121, -22.891]] });
    expect(fc.features[1].properties).toMatchObject({ codigo: 'c2', situacao: 'concluida', logradouro: 'Rua da Conceição' });
  });
});

describe('registros incompletos não derrubam o mapa', () => {
  // Reproduz o defeito: licença cancelada pode não ter data de decisão nem período, e o filtro de ano
  // fazia `null.startsWith(...)`, o que quebrava a página inteira para todos os visitantes.
  const incompleta = obra({ codigo: 'c9', situacao: 'cancelada', decisao_data: null, inicio_previsto: null, fim_previsto: null });

  it('lista de anos e filtros toleram datas ausentes', () => {
    const todas = [...obras, incompleta];
    expect(() => anosDasObras(todas)).not.toThrow();
    expect(anosDasObras(todas)).toEqual(['2026', '2025', '2022']);
    expect(filtrarObras(todas, { situacao: 'todas', ano: '', busca: '' })).toHaveLength(5);
    expect(filtrarObras(todas, { situacao: 'todas', ano: '2026', busca: '' }).map((o) => o.codigo)).not.toContain('c9');
  });

  it('trecho sem coordenada utilizável não é desenhado nem inventado, e a obra é marcada sem localização', () => {
    const sem = obra({ codigo: 'c8', trechos: [{ logradouro: 'Rua X', bairro: null, inicio: [NaN, NaN], fim: null }] });
    const vazia = obra({ codigo: 'c7', trechos: [] });
    expect(obrasParaGeoJSON([sem, vazia]).features).toHaveLength(0);
    expect(temLocalizacao(sem)).toBe(false);
    expect(temLocalizacao(vazia)).toBe(false);
    expect(temLocalizacao(obra({}))).toBe(true);
  });
});

describe('tipo e origem da intervenção', () => {
  const lista = [
    obra({ codigo: 'o1' }),
    obra({ codigo: 'o2', tipo_intervencao: 'servico' }),
    obra({ codigo: 'o3', origem: 'municipio', contratante: 'SMO' }),
    obra({ codigo: 'o4', origem: 'autarquia', tipo_intervencao: 'servico' }),
  ];
  const f = (extra: object) => filtrarObras(lista, { situacao: 'todas', ano: '', busca: '', ...extra }).map((o) => o.codigo);
  it('filtra por obra ou serviço e por origem, e os dois se combinam', () => {
    expect(f({ intervencao: 'servico' })).toEqual(['o2', 'o4']);
    expect(f({ origem: 'municipio' })).toEqual(['o3']);
    expect(f({ origem: 'autarquia', intervencao: 'servico' })).toEqual(['o4']);
    expect(f({ origem: 'autarquia', intervencao: 'obra' })).toEqual([]);
  });
  it('o balão do mapa recebe tipo, origem, descrição, contratante e período', () => {
    const p = obrasParaGeoJSON([lista[2]]).features[0].properties!;
    expect(p).toMatchObject({ tipo_intervencao: 'obra', origem: 'municipio', contratante: 'SMO', escopo: 'Rede',
      inicio_previsto: '2026-10-01', fim_previsto: '2026-10-30' });
  });
});
