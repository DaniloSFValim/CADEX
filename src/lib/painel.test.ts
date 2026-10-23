import { describe, expect, it } from 'vitest';
import type { LicencaComTrechos } from './licencas';
import {
  SEM_FILTROS, aplicarFiltros, distribuicaoPorParte, evolucaoMensal, indicadores, linhaDoTempo, maisRecentes,
  parteDe, partesDistintas, porSituacaoAdministrativa, posicaoNaJanela, proximas, temFiltro, type ContextoPartes,
} from './painel';

const HOJE = '2026-10-13';

const ctx: ContextoPartes = {
  empresas: new Map([
    ['op1', { razao_social: 'Operadora Um S.A.', nome_fantasia: 'OpUm' }],
    ['op2', { razao_social: 'Operadora Dois S.A.', nome_fantasia: null }],
    ['ter1', { razao_social: 'Terceirizada Um Ltda.', nome_fantasia: null }],
  ]),
  orgaos: new Map([['og1', { nome: 'Secretaria de Mobilidade', sigla: 'SEMOB' }]]),
};

let seq = 0;
/** Licença deferida em execução (início no passado, fim no futuro), com as sobras sobrescrevíveis. */
function lic(o: Partial<LicencaComTrechos> = {}): LicencaComTrechos {
  seq++;
  return {
    id: `l${seq}`, setor: 'telecom', processo_sei: `P-${seq}`, numero: `${seq}/2026`, tipos_obra: ['vala'], escopo: 'x',
    executora_id: 'ter1', contratante_id: 'op1', orgao_contratante_id: null,
    executora_razao_social: null, executora_cnpj: null, contratante_razao_social: null, contratante_cnpj: null,
    contratante_cpf: null, imovel_endereco: null, processo_urbanismo: null, anterior_resolucao: false,
    subcontratada_id: null, responsavel_tecnico_id: null, art_numero: null, protocolo_data: '2026-09-10',
    situacao: 'deferida', decisao_data: '2026-09-15', inicio_previsto: '2026-10-01', fim_previsto: '2026-10-30',
    validade_ate: (o.fim_previsto as string | undefined) ?? '2026-10-30',
    concluida_em: null, recomposicao_data: null, as_built_sei: null, as_built_data: null, observacoes: null,
    tipo_intervencao: 'obra', origem_intervencao: 'concessionaria', contrato_numero: null, processo_administrativo: null,
    ordem_servico_numero: null, objeto_contrato: null,
    empresas_no_deferimento: null, codigo_publico: `c${seq}`, criado_em: '2026-09-16T10:00:00Z', atualizado_em: '2026-09-16T10:00:00Z',
    licenca_trechos: [], ...o,
  } as LicencaComTrechos;
}

describe('partes: contratante e executora', () => {
  it('empresa cadastrada, órgão público, empresa sem cadastro e particular', () => {
    expect(parteDe(lic(), 'contratante', ctx)).toEqual({ chave: 'e:op1', rotulo: 'OpUm', tipo: 'empresa' });
    expect(parteDe(lic({ contratante_id: null, orgao_contratante_id: 'og1' }), 'contratante', ctx))
      .toEqual({ chave: 'o:og1', rotulo: 'SEMOB', tipo: 'orgao' });
    expect(parteDe(lic({ contratante_id: null, contratante_razao_social: 'Antiga Ltda.', contratante_cnpj: '11222333000181' }), 'contratante', ctx))
      .toEqual({ chave: 't:11222333000181', rotulo: 'Antiga Ltda.', tipo: 'sem_cadastro' });
    expect(parteDe(lic({ contratante_id: null, contratante_razao_social: 'Fulano', contratante_cpf: '52998224725' }), 'contratante', ctx))
      .toEqual({ chave: 'p:pf', rotulo: 'Particular (pessoa física)', tipo: 'particular' });
    expect(parteDe(lic({ contratante_id: null }), 'contratante', ctx)).toBeNull();
  });
  it('a mesma empresa nos dois papéis tem a mesma chave', () => {
    const l = lic({ executora_id: 'op1', contratante_id: 'op1' });
    expect(parteDe(l, 'executora', ctx)?.chave).toBe(parteDe(l, 'contratante', ctx)?.chave);
  });
  it('sem cadastro sem CNPJ agrupa pelo nome, sem diferenciar caixa nem espaços', () => {
    const a = lic({ contratante_id: null, contratante_razao_social: ' Antiga Ltda. ' });
    const b = lic({ contratante_id: null, contratante_razao_social: 'antiga ltda.' });
    expect(parteDe(a, 'contratante', ctx)?.chave).toBe(parteDe(b, 'contratante', ctx)?.chave);
  });
  it('lista cada parte uma vez, em ordem alfabética', () => {
    const ls = [lic(), lic(), lic({ contratante_id: 'op2' })];
    expect(partesDistintas(ls, 'contratante', ctx).map((p) => p.rotulo)).toEqual(['Operadora Dois S.A.', 'OpUm']);
  });
});

describe('filtros', () => {
  const programada = lic({ inicio_previsto: '2026-11-10', fim_previsto: '2026-12-10' });
  const andamento = lic();
  const vencida = lic({ inicio_previsto: '2026-08-01', fim_previsto: '2026-09-01' });
  const concluida = lic({ concluida_em: '2026-10-05' });
  const cancelada = lic({ situacao: 'cancelada', decisao_data: null, inicio_previsto: null, fim_previsto: null });
  const orgao = lic({ contratante_id: null, orgao_contratante_id: 'og1', tipos_obra: ['poste'], executora_id: 'op2' });
  const todas = [programada, andamento, vencida, concluida, cancelada, orgao];
  const f = (p: Partial<typeof SEM_FILTROS>) => aplicarFiltros(todas, { ...SEM_FILTROS, ...p }, HOJE, ctx);

  it('filtra por obra ou serviço e por origem, combinando com os demais', () => {
    const servico = lic({ tipo_intervencao: 'servico' });
    const publica = lic({ origem_intervencao: 'municipio', orgao_contratante_id: 'og1', contratante_id: null });
    const autarquia = lic({ origem_intervencao: 'autarquia', tipo_intervencao: 'servico', orgao_contratante_id: 'og1', contratante_id: null });
    const g = (p: Partial<typeof SEM_FILTROS>) => aplicarFiltros([servico, publica, autarquia, andamento], { ...SEM_FILTROS, ...p }, HOJE, ctx);
    expect(g({ intervencao: 'servico' })).toEqual([servico, autarquia]);
    expect(g({ origem: 'municipio' })).toEqual([publica]);
    expect(g({ origem: 'autarquia', intervencao: 'servico' })).toEqual([autarquia]);
    expect(g({ origem: 'autarquia', intervencao: 'obra' })).toEqual([]);
    expect(g({ origem: 'concessionaria', intervencao: 'obra' })).toEqual([andamento]);
    expect(temFiltro({ ...SEM_FILTROS, origem: 'municipio' })).toBe(true);
  });

  it('sem filtro devolve tudo', () => {
    expect(f({})).toHaveLength(todas.length);
    expect(temFiltro(SEM_FILTROS)).toBe(false);
    expect(temFiltro({ ...SEM_FILTROS, tipo: 'vala' })).toBe(true);
  });
  it('por situação operacional e administrativa', () => {
    expect(f({ status: 'estado:aguardando_inicio' })).toEqual([programada]);
    expect(f({ status: 'estado:prazo_encerrado' })).toEqual([vencida]);
    expect(f({ status: 'situacao:cancelada' })).toEqual([cancelada]);
    expect(f({ status: 'situacao:deferida' })).toHaveLength(5);
    expect(f({ status: 'grupo:concluidas' })).toEqual([concluida]);
  });
  it('por período: cruza o intervalo, não precisa estar dentro dele', () => {
    expect(f({ de: '2026-11-20', ate: '2026-12-31' })).toEqual([programada]);
    expect(f({ de: '2026-07-01', ate: '2026-08-15' })).toEqual([vencida]);
    expect(f({ de: '2027-01-01' })).toEqual([]);
  });
  it('licença sem datas do período usa a decisão (ou o protocolo)', () => {
    expect(f({ de: '2026-09-10', ate: '2026-09-20' })).toContain(cancelada);
  });
  it('por contratante, executora e tipo', () => {
    expect(f({ contratante: 'o:og1' })).toEqual([orgao]);
    expect(f({ executora: 'e:op2' })).toEqual([orgao]);
    expect(f({ tipo: 'poste' })).toEqual([orgao]);
    expect(f({ contratante: 'e:op1', tipo: 'poste' })).toEqual([]);
  });
});

describe('indicadores', () => {
  const ls = [
    lic({ inicio_previsto: '2026-10-20', fim_previsto: '2026-11-30' }),                // programada, inicia em 7 dias
    lic({ inicio_previsto: '2026-12-01', fim_previsto: '2026-12-30' }),                // programada, fora da janela
    lic({ inicio_previsto: '2026-10-01', fim_previsto: '2026-10-25' }),                // em andamento, termina em 12 dias
    lic({ inicio_previsto: '2026-10-13', fim_previsto: '2026-10-13' }),                // começa e termina hoje
    lic({ inicio_previsto: '2026-08-01', fim_previsto: '2026-09-01' }),                // prazo vencido
    lic({ inicio_previsto: '2026-09-01', fim_previsto: '2026-09-30', concluida_em: '2026-09-28' }), // concluída sem As Built
    lic({ concluida_em: '2026-10-05', as_built_sei: 'D-1', as_built_data: '2026-10-06' }),          // concluída
    lic({ situacao: 'cancelada', inicio_previsto: null, fim_previsto: null, decisao_data: null }),
    lic({ situacao: 'em_analise', inicio_previsto: null, fim_previsto: null, decisao_data: null }),
  ];
  const i = indicadores(ls, HOJE, 15, ctx);

  it('conta cada situação sem sobrepor: a soma dos estados é o total', () => {
    expect(i.total).toBe(9);
    expect(Object.values(i.porEstado).reduce((a, b) => a + b, 0)).toBe(9);
    expect(i.programadas).toBe(2);
    expect(i.emAndamento).toBe(2);
    expect(i.prazoVencido).toBe(1);
    expect(i.concluidas).toBe(2);
  });
  it('início e fim previstos na janela contam só obra aberta, de hoje em diante', () => {
    expect(i.iniciamNaJanela).toBe(2);   // 20/10 e hoje
    expect(i.terminamNaJanela).toBe(2);  // 25/10 e hoje
    expect(indicadores(ls, HOJE, 5, ctx).iniciamNaJanela).toBe(1); // só a de hoje
  });
  it('conta cada contratante e executora uma vez, separando empresas de órgãos', () => {
    const dois = [lic(), lic(), lic({ contratante_id: null, orgao_contratante_id: 'og1', executora_id: 'op2' })];
    const r = indicadores(dois, HOJE, 15, ctx);
    expect(r.contratantes).toEqual({ total: 2, empresas: 1, orgaos: 1, outras: 0 });
    expect(r.executoras).toEqual({ total: 2, empresas: 2, orgaos: 0, outras: 0 });
  });
  it('situação administrativa soma o total', () => {
    const a = porSituacaoAdministrativa(ls);
    expect(a.deferida + a.cancelada + a.em_analise + a.indeferida).toBe(9);
    expect(a).toMatchObject({ cancelada: 1, em_analise: 1, deferida: 7, indeferida: 0 });
  });
  it('sem licenças, tudo zero', () => {
    const z = indicadores([], HOJE, 15, ctx);
    expect(z.total).toBe(0);
    expect(z.contratantes.total).toBe(0);
  });
});

describe('distribuição por contratante ou executora', () => {
  it('ordena, limita e soma o resto em "demais"; o total fecha', () => {
    const ls = [
      lic(), lic(), lic(),                                     // op1 x3
      lic({ contratante_id: 'op2' }), lic({ contratante_id: 'op2' }),   // op2 x2
      lic({ contratante_id: null, orgao_contratante_id: 'og1' }),       // SEMOB x1
      lic({ contratante_id: null }),                                    // sem informação
    ];
    const r = distribuicaoPorParte(ls, 'contratante', ctx, 2);
    expect(r.barras.map((b) => [b.rotulo, b.n])).toEqual([['OpUm', 3], ['Operadora Dois S.A.', 2]]);
    expect(r.demais).toBe(1);
    expect(r.semInformacao).toBe(1);
    expect(r.barras.reduce((s, b) => s + b.n, 0) + r.demais + r.semInformacao).toBe(ls.length);
  });
});

describe('evolução mensal', () => {
  it('preenche com zero os meses sem licença', () => {
    const ls = [lic({ decisao_data: '2026-07-10' }), lic({ decisao_data: '2026-07-20' }), lic({ decisao_data: '2026-10-02' })];
    const r = evolucaoMensal(ls, 'decisao');
    expect(r.meses).toEqual([
      { mes: '2026-07', n: 2 }, { mes: '2026-08', n: 0 }, { mes: '2026-09', n: 0 }, { mes: '2026-10', n: 1 },
    ]);
    expect(r.semData).toBe(0);
  });
  it('atravessa a virada do ano', () => {
    const r = evolucaoMensal([lic({ decisao_data: '2025-12-31' }), lic({ decisao_data: '2026-01-01' })], 'decisao');
    expect(r.meses.map((m) => m.mes)).toEqual(['2025-12', '2026-01']);
  });
  it('por registro usa o dia de entrada no CADEX; quem não tem a data vai em semData', () => {
    const ls = [lic({ decisao_data: null, criado_em: '2026-03-05T09:00:00Z' }), lic({ decisao_data: '2026-01-01' })];
    expect(evolucaoMensal(ls, 'registro').meses.reduce((s, m) => s + m.n, 0)).toBe(2);
    const d = evolucaoMensal(ls, 'decisao');
    expect(d.semData).toBe(1);
    expect(d.meses).toEqual([{ mes: '2026-01', n: 1 }]);
  });
  it('sem licenças, sem meses', () => {
    expect(evolucaoMensal([], 'decisao')).toEqual({ meses: [], semData: 0 });
  });
});

describe('listas e linha do tempo', () => {
  it('próximos inícios e términos: só aberta, em ordem de data', () => {
    const a = lic({ inicio_previsto: '2026-10-25', fim_previsto: '2026-11-30' });
    const b = lic({ inicio_previsto: '2026-10-15', fim_previsto: '2026-11-30' });
    const concluida = lic({ inicio_previsto: '2026-10-14', concluida_em: '2026-10-14' });
    const cancelada = lic({ situacao: 'cancelada', inicio_previsto: '2026-10-14' });
    expect(proximas([a, b, concluida, cancelada], HOJE, 15, 'inicio')).toEqual([b, a]);
    expect(proximas([a, b], HOJE, 15, 'fim')).toEqual([]);
  });
  it('mais recentes pelo registro', () => {
    const velha = lic({ criado_em: '2026-01-01T00:00:00Z' });
    const nova = lic({ criado_em: '2026-10-01T00:00:00Z' });
    expect(maisRecentes([velha, nova], 1)).toEqual([nova]);
  });
  const janela = { de: '2026-10-01', ate: '2026-10-31' };
  it('posiciona na janela e recorta o que passa das bordas', () => {
    const r = linhaDoTempo([lic({ inicio_previsto: '2026-09-15', fim_previsto: '2026-10-16' })], HOJE, janela);
    expect(r.itens[0].esq).toBe(0);
    expect(r.itens[0].larg).toBeCloseTo(((16 - 1 + 1) / 30) * 100, 5);
    expect(posicaoNaJanela('2026-10-16', janela)).toBeCloseTo(50, 5);
  });
  it('fora da janela não entra; sem período é contada à parte; excesso é informado', () => {
    const fora = lic({ inicio_previsto: '2026-12-01', fim_previsto: '2026-12-31' });
    const sem = lic({ inicio_previsto: null, fim_previsto: null });
    const muitas = Array.from({ length: 5 }, () => lic());
    const r = linhaDoTempo([fora, sem, ...muitas], HOJE, janela, 3);
    expect(r.itens).toHaveLength(3);
    expect(r.omitidas).toBe(2);
    expect(r.semPeriodo).toBe(1);
  });
  it('licença de um dia tem largura mínima visível', () => {
    const r = linhaDoTempo([lic({ inicio_previsto: '2026-10-10', fim_previsto: '2026-10-10' })], HOJE, { de: '2026-01-01', ate: '2026-12-31' });
    expect(r.itens[0].larg).toBeGreaterThanOrEqual(0.6);
  });
});
