import { describe, expect, it } from 'vitest';
import {
  anteriorResolucao, estadoLicenca, lerCoordenada, linkMapa, nomeExecutora, pendenciasLicencas, urlPublicaLicenca,
} from './licencas';

describe('licença anterior à Resolução', () => {
  it('vale para decisão antes de 09/09/2026', () => {
    expect(anteriorResolucao('2022-03-20')).toBe(true);
    expect(anteriorResolucao('2026-09-08')).toBe(true);
    expect(anteriorResolucao('2026-09-09')).toBe(false);
    expect(anteriorResolucao(null)).toBe(false);
  });
  it('mostra a executora cadastrada ou a digitada', () => {
    const porId = new Map([['e1', { razao_social: 'TELEMAR NORTE LESTE S.A.', nome_fantasia: 'Oi' }]]);
    expect(nomeExecutora({ executora_id: 'e1', executora_razao_social: null }, porId)).toBe('Oi');
    expect(nomeExecutora({ executora_id: null, executora_razao_social: 'Antiga Ltda.' }, porId)).toBe('Antiga Ltda.');
  });
});

describe('coordenadas', () => {
  it('lê o par digitado ou colado', () => {
    expect(lerCoordenada('-22.8950, -43.1230')).toEqual({ lat: -22.895, lng: -43.123 });
    expect(lerCoordenada('-22.8950 -43.1230')).toEqual({ lat: -22.895, lng: -43.123 });
  });
  it('corrige o par invertido', () => {
    expect(lerCoordenada('-43.1230, -22.8950')).toEqual({ lat: -22.895, lng: -43.123 });
  });
  it('lê links do Google Maps', () => {
    expect(lerCoordenada('https://www.google.com/maps/@-22.8950,-43.1230,17z')).toEqual({ lat: -22.895, lng: -43.123 });
    expect(lerCoordenada('https://www.google.com/maps/place/X/data=!3d-22.8950!4d-43.1230'))
      .toEqual({ lat: -22.895, lng: -43.123 });
  });
  it('recusa fora de Niterói ou ilegível', () => {
    expect(lerCoordenada('-23.5505, -46.6333')).toBeNull(); // São Paulo
    expect(lerCoordenada('Rua da Conceição')).toBeNull();
    expect(lerCoordenada('')).toBeNull();
  });
  it('monta o link do ponto ou do trecho', () => {
    expect(linkMapa({ inicio_lat: -22.9, inicio_lng: -43.1, fim_lat: null, fim_lng: null }))
      .toContain('query=-22.9,-43.1');
    expect(linkMapa({ inicio_lat: -22.9, inicio_lng: -43.1, fim_lat: -22.91, fim_lng: -43.11 }))
      .toContain('destination=-22.91,-43.11');
  });
});

describe('situação da licença', () => {
  const base = { situacao: 'deferida' as const, inicio_previsto: '2026-10-01', fim_previsto: '2026-10-31',
                 concluida_em: null, as_built_sei: null };
  it('segue o cronograma', () => {
    expect(estadoLicenca(base, '2026-09-30')).toBe('aguardando_inicio');
    expect(estadoLicenca(base, '2026-10-01')).toBe('em_execucao');
    expect(estadoLicenca(base, '2026-10-31')).toBe('em_execucao');
    expect(estadoLicenca(base, '2026-11-01')).toBe('prazo_encerrado');
  });
  it('conclusão e As Built', () => {
    expect(estadoLicenca({ ...base, concluida_em: '2026-10-20' }, '2026-11-01')).toBe('concluida_sem_as_built');
    expect(estadoLicenca({ ...base, concluida_em: '2026-10-20', as_built_sei: '123' }, '2026-11-01')).toBe('concluida');
  });
  it('não deferida mantém a situação', () => {
    expect(estadoLicenca({ ...base, situacao: 'em_analise' }, '2026-10-15')).toBe('em_analise');
    expect(estadoLicenca({ ...base, situacao: 'cancelada' }, '2026-10-15')).toBe('cancelada');
  });
});

describe('página pública', () => {
  it('monta o endereço do QR Code com o código público, não com o id', () => {
    expect(urlPublicaLicenca('a1b2c3d4e5f6a1b2c3d4e5f6', 'https://cadex-niteroi.vercel.app'))
      .toBe('https://cadex-niteroi.vercel.app/licenca/a1b2c3d4e5f6a1b2c3d4e5f6');
  });
});

describe('pendências do painel', () => {
  const l = (o: Record<string, unknown>) => ({
    id: String(o.id), situacao: 'deferida', inicio_previsto: '2026-09-10', fim_previsto: '2026-09-20',
    concluida_em: null, as_built_sei: null, anterior_resolucao: false, licenca_trechos: [], ...o,
  }) as unknown as Parameters<typeof pendenciasLicencas>[0][number];
  const hoje = '2026-10-01';
  const r = pendenciasLicencas([
    l({ id: 'a' }),                                                     // prazo encerrado há 11 dias
    l({ id: 'b', fim_previsto: '2026-09-30' }),                         // há 1 dia
    l({ id: 'c', concluida_em: '2026-09-15' }),                         // sem As Built há 16 dias
    l({ id: 'd', concluida_em: '2026-09-15', as_built_sei: '1' }),      // concluída: fora
    l({ id: 'e', fim_previsto: '2026-12-31' }),                         // em execução: fora
    l({ id: 'f', anterior_resolucao: true, fim_previsto: '2022-05-30' }), // histórica: só conta
    l({ id: 'g', situacao: 'cancelada' }),                              // cancelada: fora
  ], hoje);
  it('lista prazo encerrado e sem As Built, mais atrasados primeiro', () => {
    expect(r.prazoEncerrado.map((p) => [p.licenca.id, p.dias])).toEqual([['a', 11], ['b', 1]]);
    expect(r.semAsBuilt.map((p) => [p.licenca.id, p.dias])).toEqual([['c', 16]]);
  });
  it('só conta as anteriores à Resolução', () => {
    expect(r.historicasEmAberto).toBe(1);
  });
});
