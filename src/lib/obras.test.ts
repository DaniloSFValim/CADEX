import { describe, expect, it } from 'vitest';
import { anosDasObras, barraNoAno, filtrarObras, fracaoDoAno, obrasNoMes, obrasParaGeoJSON, temLocalizacao, type ObraPublica } from './obras';

const obra = (o: Partial<ObraPublica>): ObraPublica => ({
  codigo: 'c1', setor: 'telecom', numero: '001/2026', tipos_obra: ['vala'], tipo_intervencao: 'obra', origem: 'concessionaria', escopo: 'Rede', inicio_previsto: '2026-10-01',
  fim_previsto: '2026-10-30', situacao: 'vigente', executora: 'Rede Fibra',
  contratante: 'Oi', trechos: [{ logradouro: 'Rua Mem de Sá', bairro: 'Icaraí', inicio: [-43.11, -22.905], fim: null }],
  ...o,
});

const obras = [
  obra({}),
  obra({ codigo: 'c2', numero: '045/2022', inicio_previsto: '2022-03-20', fim_previsto: '2022-04-20', situacao: 'concluida', executora: 'Antiga Ltda.',
         trechos: [{ logradouro: 'Rua da Conceição', bairro: 'Centro', inicio: [-43.12, -22.89], fim: [-43.121, -22.891] }] }),
  obra({ codigo: 'c3', numero: '050/2026', situacao: 'aguardando_inicio' }),
  obra({ codigo: 'c4', numero: '060/2025', inicio_previsto: '2025-05-01', fim_previsto: '2025-06-01', situacao: 'cancelada' }),
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
  it('lista os anos de início previsto, do mais recente', () => {
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
  // Reproduz o defeito: licença cancelada pode não ter período, e o filtro de ano
  // fazia `null.startsWith(...)`, o que quebrava a página inteira para todos os visitantes.
  const incompleta = obra({ codigo: 'c9', situacao: 'cancelada', inicio_previsto: null, fim_previsto: null });

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

describe('fim igual ao início', () => {
  it('vira ponto, porque a linha de comprimento zero não aparece no mapa', () => {
    const fc = obrasParaGeoJSON([obra({ trechos: [{ logradouro: 'Av. X', bairro: null, inicio: [-43.11156, -22.907928], fim: [-43.11156, -22.907928] }] })]);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [-43.11156, -22.907928] });
  });
});

describe('faixa do tempo', () => {
  it('fração do ano: 1º de janeiro é 0, e o meio do ano fica perto de 0,5', () => {
    expect(fracaoDoAno('2026-01-01', 2026)).toBe(0);
    expect(fracaoDoAno('2026-07-02', 2026)).toBeCloseTo(0.5, 1);
  });
  it('barra de uma obra dentro do ano', () => {
    const b = barraNoAno({ inicio_previsto: '2026-04-01', fim_previsto: '2026-06-30' }, 2026)!;
    expect(b.esquerda).toBeCloseTo(fracaoDoAno('2026-04-01', 2026));
    expect(b.largura).toBeGreaterThan(0.2);
    expect(b.largura).toBeLessThan(0.3);
  });
  it('obra que começa antes e termina depois do ano é cortada nas bordas', () => {
    expect(barraNoAno({ inicio_previsto: '2025-06-01', fim_previsto: '2027-02-01' }, 2026)).toEqual({ esquerda: 0, largura: 1 });
  });
  it('fora do ano, sem período ou só com uma data: sem barra', () => {
    expect(barraNoAno({ inicio_previsto: '2024-01-01', fim_previsto: '2024-02-01' }, 2026)).toBeNull();
    expect(barraNoAno({ inicio_previsto: null, fim_previsto: '2026-02-01' }, 2026)).toBeNull();
    expect(barraNoAno({ inicio_previsto: '2026-02-01', fim_previsto: null }, 2026)).toBeNull();
  });
  it('obra de um dia só ainda aparece', () => {
    const b = barraNoAno({ inicio_previsto: '2026-03-10', fim_previsto: '2026-03-10' }, 2026)!;
    expect(b.largura).toBeGreaterThan(0);
  });
});

describe('obras por mês', () => {
  it('uma obra conta em todos os meses que cobre', () => {
    const meses = obrasNoMes([obra({ inicio_previsto: '2026-03-15', fim_previsto: '2026-05-02' })], 2026);
    expect(meses.map((m) => m.obras.length)).toEqual([0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('separa a contagem por situação', () => {
    const meses = obrasNoMes([
      obra({ codigo: 'a', inicio_previsto: '2026-01-01', fim_previsto: '2026-01-31', situacao: 'vigente' }),
      obra({ codigo: 'b', inicio_previsto: '2026-01-10', fim_previsto: '2026-02-10', situacao: 'concluida' }),
    ], 2026);
    expect(meses[0].porSituacao).toEqual({ vigente: 1, concluida: 1 });
    expect(meses[1].porSituacao).toEqual({ concluida: 1 });
  });
  it('obra sem período, ou de outro ano, não entra em nenhum mês', () => {
    const meses = obrasNoMes([
      obra({ inicio_previsto: null, fim_previsto: '2026-02-01' }),
      obra({ inicio_previsto: '2024-01-01', fim_previsto: '2024-02-01' }),
    ], 2026);
    expect(meses.every((m) => m.obras.length === 0)).toBe(true);
  });
});

describe('área da intervenção no mapa', () => {
  const anel: [number, number][][] = [[[-43.105, -22.905], [-43.1, -22.905], [-43.1, -22.9], [-43.105, -22.905]]];

  it('trecho com área gera o polígono, além do ponto do trecho', () => {
    const com = obra({ trechos: [{ logradouro: 'Rua Área', bairro: null, inicio: [-43.105, -22.905], fim: null,
                                   area: { type: 'Polygon', coordinates: anel } }] });
    const tipos = obrasParaGeoJSON([com]).features.map((f) => f.geometry.type);
    expect(tipos).toEqual(['Polygon', 'Point']);
    expect(obrasParaGeoJSON([com]).features[0].properties?.situacao).toBe('vigente');
  });

  it('trecho sem área continua só com o ponto ou a linha', () => {
    expect(obrasParaGeoJSON([obra({})]).features.map((f) => f.geometry.type)).toEqual(['Point']);
  });
});
