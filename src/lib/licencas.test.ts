import { describe, expect, it } from 'vitest';
import {
  anteriorResolucao, cadastroRetroativo, desempenhoExecutora, erroPeriodoObra, estadoLicenca, lerCoordenada, linkMapa, mesmaEmpresaNosPapeis,
  nomeExecutora, pendenciasLicencas, rotuloProrrogacao, situacoesRegistraveis, urlPublicaLicenca,
} from './licencas';

describe('licença anterior à Resolução', () => {
  it('vale para protocolo antes de 09/09/2026', () => {
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
  const base = { situacao: 'deferida' as const, orgao_contratante_id: null, validade_ate: '2026-10-22',
                 inicio_previsto: '2026-10-01', concluida_em: null, as_built_sei: null };
  it('a validade de 30 dias vence a licença, mesmo com a obra prevista para depois', () => {
    expect(estadoLicenca(base, '2026-10-22')).toBe('em_execucao');
    expect(estadoLicenca(base, '2026-10-23')).toBe('prazo_encerrado');
  });
  it('antes do início previsto, aguarda; depois, em execução', () => {
    expect(estadoLicenca({ ...base, validade_ate: '2026-12-31' }, '2026-09-30')).toBe('aguardando_inicio');
    expect(estadoLicenca({ ...base, validade_ate: '2026-12-31' }, '2026-10-01')).toBe('em_execucao');
  });
  it('prorrogar a validade volta a deixá-la vigente', () => {
    expect(estadoLicenca({ ...base, validade_ate: '2026-11-30' }, '2026-11-01')).toBe('em_execucao');
  });
  it('órgão público é registro, sem prazo, mesmo com data passada', () => {
    expect(estadoLicenca({ ...base, orgao_contratante_id: 'o1', validade_ate: null }, '2030-01-01')).toBe('registro');
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
    validade_ate: (o.fim_previsto as string | undefined) ?? '2026-09-20', orgao_contratante_id: null,
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
    l({ id: 'h', concluida_em: '2026-09-15', as_built_sei: '1', recomposicao_data: '2026-09-18' }), // recomposta: fora
  ], hoje);
  it('lista prazo encerrado e sem As Built, mais atrasados primeiro', () => {
    expect(r.prazoEncerrado.map((p) => [p.licenca.id, p.dias])).toEqual([['a', 11], ['b', 1]]);
    expect(r.semAsBuilt.map((p) => [p.licenca.id, p.dias])).toEqual([['c', 16]]);
  });
  it('lista recomposição pendente (concluída sem recompor), exclui as já recompostas', () => {
    expect(r.semRecomposicao.map((p) => p.licenca.id).sort()).toEqual(['c', 'd']);
  });
  it('só conta as anteriores à Resolução', () => {
    expect(r.historicasEmAberto).toBe(1);
  });
});

describe('desempenho da executora', () => {
  const l = (o: Record<string, unknown>) => ({
    executora_id: 'X', situacao: 'deferida', anterior_resolucao: false,
    inicio_previsto: '2026-09-01', fim_previsto: '2026-09-20', concluida_em: null,
    validade_ate: (o.fim_previsto as string | undefined) ?? '2026-09-20', orgao_contratante_id: null,
    recomposicao_data: null, as_built_sei: null, ...o,
  }) as unknown as Parameters<typeof desempenhoExecutora>[0][number];
  const hoje = '2026-10-01';
  const d = desempenhoExecutora([
    l({ concluida_em: '2026-09-15', recomposicao_data: '2026-09-18', as_built_sei: '1' }), // no prazo, recomposta, as built
    l({ concluida_em: '2026-09-25' }),                                                     // atrasou a conclusão, sem recomp/as built
    l({ fim_previsto: '2026-09-10' }),                                                     // prazo encerrado sem conclusão
    l({ executora_id: 'Y', concluida_em: '2026-09-15' }),                                  // outra executora: fora
    l({ anterior_resolucao: true, concluida_em: '2026-09-15' }),                           // histórica: fora
  ], 'X', hoje);

  it('conta obras, conclusões, prazo, recomposição e As Built da executora', () => {
    expect(d.obras).toBe(3);
    expect(d.concluidas).toBe(2);
    expect(d.noPrazo).toBe(1);
    expect(d.atrasadas).toBe(1);
    expect(d.recompostas).toBe(1);
    expect(d.comAsBuilt).toBe(1);
  });
  it('é crítico quando há prazo de cronograma encerrado', () => {
    expect(d.nivel).toBe('ruim');
  });
  it('sem obras sob a Resolução, fica sem dados', () => {
    expect(desempenhoExecutora([], 'X', hoje).nivel).toBe('sem_dados');
  });
});

describe('situação "Indeferida"', () => {
  const todas = ['em_execucao', 'concluida', 'indeferida', 'cancelada'] as const;
  it('não é oferecida em licença nova nem em outra situação', () => {
    expect(situacoesRegistraveis(todas, null)).toEqual(['em_execucao', 'concluida', 'cancelada']);
    expect(situacoesRegistraveis(todas, 'deferida')).toEqual(['em_execucao', 'concluida', 'cancelada']);
    expect(situacoesRegistraveis(todas, 'cancelada')).not.toContain('indeferida');
  });
  it('continua aparecendo na licença que já está indeferida (histórico)', () => {
    expect(situacoesRegistraveis(todas, 'indeferida')).toContain('indeferida');
  });
});

describe('período da obra ou serviço', () => {
  const base = { deferida: true, inicio: '2026-10-01', fim: '2026-10-30', concluidaEm: '' };
  it('aceita fim igual ou posterior ao início', () => {
    expect(erroPeriodoObra({ ...base, inicio: '2026-10-01' })).toBeNull();
    expect(erroPeriodoObra({ ...base, inicio: '2026-10-30' })).toBeNull();
  });
  it('recusa fim anterior ao início', () => {
    expect(erroPeriodoObra({ ...base, inicio: '2026-11-01' }))
      .toBe('O fim da obra ou serviço não pode ser anterior ao início.');
  });
  it('início em branco é recusado: é obrigatório na licença deferida', () => {
    expect(erroPeriodoObra({ ...base, inicio: '' }))
      .toBe('Informe o início da obra ou serviço. A validade de 30 dias conta a partir dele.');
    expect(erroPeriodoObra({ ...base, fim: '2026-09-14' }))
      .toBe('O fim da obra ou serviço não pode ser anterior ao início.');
    expect(erroPeriodoObra(base)).toBeNull();
  });
  it('recusa conclusão anterior ao início', () => {
    expect(erroPeriodoObra({ ...base, inicio: '2026-10-01', concluidaEm: '2026-09-30' }))
      .toBe('A conclusão não pode ser anterior ao início da obra ou serviço.');
  });
  it('não valida o período de licença que não está deferida', () => {
    expect(erroPeriodoObra({ ...base, deferida: false, inicio: '2026-12-01' })).toBeNull();
  });
});

describe('contratante e executora', () => {
  it('é a mesma empresa só quando as duas são a mesma cadastrada', () => {
    expect(mesmaEmpresaNosPapeis({ contratante_id: 'a', executora_id: 'a' })).toBe(true);
    expect(mesmaEmpresaNosPapeis({ contratante_id: 'a', executora_id: 'b' })).toBe(false);
    expect(mesmaEmpresaNosPapeis({ contratante_id: null, executora_id: null })).toBe(false);
    expect(mesmaEmpresaNosPapeis({ contratante_id: null, executora_id: 'a' })).toBe(false);
  });
});

describe('As Built de registro anterior à Resolução', () => {
  it('concluída sem As Built, mas anterior à Resolução: fica concluída, não cobrada', () => {
    expect(estadoLicenca({ situacao: 'deferida', orgao_contratante_id: null, validade_ate: null, inicio_previsto: '2025-01-01',
      concluida_em: '2025-03-01', as_built_sei: null, anterior_resolucao: true }, '2026-10-28')).toBe('concluida');
  });
  it('concluída sem As Built sob a Resolução continua pendente', () => {
    expect(estadoLicenca({ situacao: 'deferida', orgao_contratante_id: null, validade_ate: null, inicio_previsto: '2026-10-01',
      concluida_em: '2026-10-20', as_built_sei: null, anterior_resolucao: false }, '2026-10-28')).toBe('concluida_sem_as_built');
  });
});

describe('cadastro retroativo', () => {
  it('conclusão registrada mais de 30 dias antes do cadastro é retroativa', () => {
    expect(cadastroRetroativo({ concluida_em: '2025-04-06', criado_em: '2026-10-20T10:00:00Z' })).toBe(true);
  });
  it('conclusão recente, sem conclusão ou cadastro no mesmo mês não é retroativa', () => {
    expect(cadastroRetroativo({ concluida_em: '2026-10-10', criado_em: '2026-10-20T10:00:00Z' })).toBe(false);
    expect(cadastroRetroativo({ concluida_em: null, criado_em: '2026-10-20T10:00:00Z' })).toBe(false);
  });
});

describe('prorrogação contada', () => {
  it('rótulo cresce com a contagem e fica vazio sem prorrogação', () => {
    expect(rotuloProrrogacao(0)).toBe('');
    expect(rotuloProrrogacao(1)).toBe('1ª prorrogação');
    expect(rotuloProrrogacao(2)).toBe('2ª prorrogação');
    expect(rotuloProrrogacao(3)).toBe('3ª prorrogação');
  });
});
