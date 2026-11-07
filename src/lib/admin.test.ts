import { describe, expect, it } from 'vitest';
import type { Empresa } from './empresas';
import type { LicencaComTrechos } from './licencas';
import { categoriaProblema, contagensLicencas, duplicidades, inconsistencias, normalizarNome, participacoes } from './admin';

const HOJE = '2026-10-13';

const emp = (id: string, over: Partial<Empresa> = {}): Empresa => ({
  id, codigo_cadex: `X-${id}`, cnpj: '00000000000191', razao_social: `${id} LTDA`, nome_fantasia: null, tipo: 'operadora',
  setores: ['telecom'], email: 'x@y.z', telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
  bairro: null, cidade: null, uf: null, representante: null, observacoes: null, situacao: 'deferida', processo_numero: null,
  data_requerimento: null, portaria_numero: null, portaria_data: null, validade_ate: '2027-12-31', notificacao_data: null,
  logo_arquivo: null, ativa: true, executa_obras: false, criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-01T00:00:00Z', ...over,
});

let seq = 0;
const lic = (o: Partial<LicencaComTrechos> = {}): LicencaComTrechos => {
  seq++;
  return {
    id: `l${seq}`, setor: 'telecom', processo_sei: `P-${String(seq).padStart(3, '0')}`, numero: `${String(seq).padStart(3, '0')}/2026`, tipos_obra: ['vala'], escopo: 'x',
    executora_id: 'op1', contratante_id: null, orgao_contratante_id: null, executora_razao_social: null, executora_cnpj: null,
    contratante_razao_social: null, contratante_cnpj: null, contratante_cpf: null, imovel_endereco: null, processo_urbanismo: null,
    anterior_resolucao: false, subcontratada_id: null, responsavel_tecnico_id: null, art_numero: null, protocolo_data: '2026-09-10',
    situacao: 'deferida', inicio_previsto: '2026-10-01', fim_previsto: '2026-10-30', concluida_em: null,
    recomposicao_data: null, as_built_sei: null, as_built_data: null, observacoes: null, empresas_no_deferimento: null,
    codigo_publico: `c${seq}`, criado_em: '2026-09-16T10:00:00Z', atualizado_em: '2026-09-16T10:00:00Z',
    licenca_trechos: [{ id: 't', ordem: 1, logradouro: 'Rua A', bairro: 'Centro', referencia: null, inicio_lat: -22.9, inicio_lng: -43.1, fim_lat: null, fim_lng: null }],
    ...o,
  } as LicencaComTrechos;
};

describe('normalizarNome', () => {
  it('ignora acento, caixa, pontuação e sufixo societário', () => {
    expect(normalizarNome('Telemar Norte Leste S.A.')).toBe('telemar norte leste');
    expect(normalizarNome('TELEMAR NORTE LESTE SA')).toBe('telemar norte leste');
    expect(normalizarNome('Construção & Cia Ltda.')).toBe('construcao');
    expect(normalizarNome('  Águas   de Niterói  ')).toBe('aguas de niteroi');
  });
});

describe('duplicidades', () => {
  it('acha o mesmo nome escrito de outro jeito', () => {
    const g = duplicidades([
      emp('a', { cnpj: '11111111000191', razao_social: 'Telemar Norte Leste S.A.' }),
      emp('b', { cnpj: '22222222000191', razao_social: 'TELEMAR NORTE LESTE SA' }),
      emp('c', { cnpj: '33333333000191', razao_social: 'Outra Empresa' }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].motivo).toBe('nome');
    expect(g[0].empresas.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });
  it('acha matriz e filial pela raiz do CNPJ, sem repetir o par já achado pelo nome', () => {
    const g = duplicidades([
      emp('m', { cnpj: '12345678000195', razao_social: 'Alfa Ltda.' }),
      emp('f', { cnpj: '12345678000276', razao_social: 'Alfa Ltda' }),
      emp('g', { cnpj: '12345678000357', razao_social: 'Filial Beta' }),
    ]);
    // m e f repetem o nome E a raiz: uma vez só; g só repete a raiz (com os dois).
    const ids = g.map((x) => x.empresas.map((e) => e.id).sort().join(','));
    expect(ids).toContain('f,m');
    expect(ids).toContain('f,g,m');
    expect(g.filter((x) => x.empresas.length === 2)).toHaveLength(1);
  });
  it('sem repetição, sem aviso', () => {
    expect(duplicidades([emp('a', { cnpj: '11111111000191' }), emp('b', { cnpj: '22222222000191', razao_social: 'Beta' })])).toEqual([]);
  });
});

describe('participações', () => {
  it('conta por papel e cada licença uma vez por empresa', () => {
    const ls = [
      lic({ executora_id: 'ter', contratante_id: 'op1' }),
      lic({ executora_id: 'op1', contratante_id: 'op1' }),   // a própria contratante executa
      lic({ executora_id: 'ter', contratante_id: 'op2', subcontratada_id: 'sub' }),
    ];
    const p = participacoes(ls);
    expect(p.get('op1')).toEqual({ contratante: 2, executora: 1, subcontratada: 0, licencas: 2 });
    expect(p.get('ter')).toEqual({ contratante: 0, executora: 2, subcontratada: 0, licencas: 2 });
    expect(p.get('sub')).toEqual({ contratante: 0, executora: 0, subcontratada: 1, licencas: 1 });
  });
});

describe('inconsistências', () => {
  const empresas = new Map([
    ['op1', emp('op1')],
    ['ter', emp('ter', { tipo: 'terceirizada' })],
    ['off', emp('off', { ativa: false })],
    ['inapta', emp('inapta', { situacao: 'inapta', validade_ate: null })],
  ]);
  const acha = (l: LicencaComTrechos) => inconsistencias([l], HOJE, empresas)[0]?.problemas ?? [];

  it('licença em ordem não aparece', () => {
    expect(acha(lic())).toEqual([]);
    expect(acha(lic({ situacao: 'cancelada', concluida_em: null, fim_previsto: '2020-01-01' }))).toEqual([]);
  });
  it('contratante = executora sem a marca no cadastro da empresa', () => {
    const sem = acha(lic({ contratante_id: 'op1', executora_id: 'op1' }));
    expect(sem.some((t) => t.includes('não marca que ela executa obras'))).toBe(true);
    const empresasMarcada = new Map([['op1', emp('op1', { executa_obras: true })]]);
    const com = inconsistencias([lic({ contratante_id: 'op1', executora_id: 'op1' })], HOJE, empresasMarcada)[0]?.problemas ?? [];
    expect(com.some((t) => t.includes('não marca que ela executa obras'))).toBe(false);
  });
  it('início depois da validade (ano trocado) e concluída com fim além da validade', () => {
    const anoTrocado = acha(lic({ inicio_previsto: '2026-09-15', fim_previsto: '2026-10-14', validade_ate: '2025-09-03' }));
    expect(anoTrocado.some((t) => t.startsWith('Início da obra ou serviço depois da validade'))).toBe(true);
    expect(categoriaProblema(anoTrocado.find((t) => t.startsWith('Início'))!)).toBe('datas_incoerentes');
    const concluida = acha(lic({ inicio_previsto: '2025-09-15', fim_previsto: '2025-10-14', validade_ate: '2025-09-30', concluida_em: '2025-10-14' }));
    expect(concluida.some((t) => t.startsWith('Fim da obra ou serviço depois da validade'))).toBe(true);
  });
  it('obra aberta com fim além da validade não é aviso: a validade se prorroga', () => {
    const aberta = acha(lic({ inicio_previsto: HOJE, fim_previsto: '2099-12-31', validade_ate: '2099-01-30', concluida_em: null }));
    expect(aberta.some((t) => t.includes('depois da validade'))).toBe(false);
  });
  it('trecho sem bairro', () => {
    const base = lic();
    const semBairro = acha({ ...base, licenca_trechos: base.licenca_trechos.map((t) => ({ ...t, bairro: ' ' })) });
    expect(semBairro.some((t) => t.startsWith('Trecho sem bairro'))).toBe(true);
  });
  it('fim vencido sem conclusão', () => {
    expect(acha(lic({ inicio_previsto: '2026-08-01', fim_previsto: '2026-09-01', validade_ate: '2026-09-01' }))).toContain('Fim da obra ou serviço vencido, sem conclusão registrada.');
  });
  it('concluída sem As Built e sem recomposição; histórica não é cobrada', () => {
    const c = lic({ concluida_em: '2026-10-05' });
    expect(acha(c)).toEqual(expect.arrayContaining(['Concluída sem As Built (art. 26).', 'Concluída sem a recomposição do pavimento registrada.']));
    expect(acha(lic({ concluida_em: '2026-10-05', anterior_resolucao: true }))).toEqual([]);
  });
  it('terceirizada sem contratante, exceto no histórico', () => {
    expect(acha(lic({ executora_id: 'ter' }))).toContain('Executora terceirizada sem contratante.');
    expect(acha(lic({ executora_id: 'ter', contratante_id: 'op1' }))).toEqual([]);
    expect(acha(lic({ executora_id: 'ter', anterior_resolucao: true }))).toEqual([]);
  });
  it('empresa desativada e executora que deixou de estar habilitada', () => {
    expect(acha(lic({ executora_id: 'off' }))[0]).toMatch(/executora \(off LTDA\) está com o cadastro desativado/);
    const sem = acha(lic({ executora_id: 'inapta' }));
    expect(sem.some((m) => m.includes('não está habilitada hoje'))).toBe(true);
    // Obra já concluída não cobra habilitação.
    const concluida = acha(lic({ executora_id: 'inapta', concluida_em: '2026-10-05', as_built_sei: 'D', as_built_data: '2026-10-06', recomposicao_data: '2026-10-07' }));
    expect(concluida.some((m) => m.includes('não está habilitada'))).toBe(false);
  });
  it('sem trecho ou sem período, quando deferida', () => {
    expect(acha(lic({ licenca_trechos: [] }))).toContain('Sem trecho cadastrado.');
    expect(acha(lic({ fim_previsto: null }))).toContain('Sem início ou fim da obra ou serviço.');
  });
  it('mais problemas primeiro', () => {
    const muitos = lic({ executora_id: 'off', licenca_trechos: [], inicio_previsto: '2026-08-01', fim_previsto: '2026-09-01', validade_ate: '2026-09-01' });
    const um = lic({ licenca_trechos: [] });
    const r = inconsistencias([um, muitos], HOJE, empresas);
    expect(r[0].licenca).toBe(muitos);
  });
});

describe('dados a revisar: prazo e número', () => {
  const empresas = new Map([['op1', emp('op1')]]);
  const problemas = (l: LicencaComTrechos) => inconsistencias([l], HOJE, empresas)[0]?.problemas ?? [];

  it('prazo de mais de um ano entre início e fim é apontado', () => {
    expect(problemas(lic({ inicio_previsto: '2025-08-19', fim_previsto: '2026-11-05' }))
      .some((x) => x.includes('Mais de um ano'))).toBe(true);
  });

  it('prazo de até um ano não é apontado', () => {
    expect(problemas(lic({ inicio_previsto: '2026-01-01', fim_previsto: '2026-12-31' }))
      .some((x) => x.includes('Mais de um ano'))).toBe(false);
  });

  it('número fora do padrão 000/AAAA é apontado; o padrão não', () => {
    expect(problemas(lic({ numero: '27/2025' })).some((x) => x.includes('fora do padrão'))).toBe(true);
    expect(problemas(lic({ numero: '027/2025' })).some((x) => x.includes('fora do padrão'))).toBe(false);
  });
});

describe('processo SEI repetido', () => {
  const empresas = new Map([['op1', emp('op1')]]);
  it('avisa as duas licenças ativas que compartilham o mesmo processo', () => {
    const a = lic({ processo_sei: 'NIT-1/900/2026', numero: '900/2026' });
    const b = lic({ processo_sei: 'NIT-1/900/2026', numero: '901/2026' });
    const r = inconsistencias([a, b], HOJE, empresas);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.licenca === a)?.problemas).toContain('Processo SEI repetido em outra licença ativa (901/2026).');
    expect(r.find((x) => x.licenca === b)?.problemas).toContain('Processo SEI repetido em outra licença ativa (900/2026).');
  });

  it('não avisa licença cancelada nem processo que aparece uma vez só', () => {
    const a = lic({ processo_sei: 'NIT-1/910/2026' });
    const cancelada = lic({ processo_sei: 'NIT-1/910/2026', situacao: 'cancelada' });
    expect(inconsistencias([a, cancelada], HOJE, empresas).some((x) => x.problemas.some((p) => p.includes('SEI repetido')))).toBe(false);
  });
});

describe('contagensLicencas', () => {
  it('separa cadastradas no CADEX de já emitidas antes do CADEX e conta por situação', () => {
    const a = lic({ id: 'a', numero: '001/2026', situacao: 'deferida' });
    const b = lic({ id: 'b', numero: '002/2026', situacao: 'cancelada' });
    const c = lic({ id: 'c', numero: '003/2026', situacao: 'deferida', anterior_resolucao: true, emitida_em_sistema_anterior: true });
    const r = contagensLicencas([a, b, c], HOJE, new Map());
    expect(r.total).toBe(3);
    expect(r.porOrigem).toEqual({ novo: 2, anterior: 1 });
    expect(r.porEstado.cancelada).toBe(1);
  });
  it('conta avisos de revisão por tipo', () => {
    const x = lic({ id: 'x', numero: '1/2026', processo_sei: '111/2026' });
    const y = lic({ id: 'y', numero: '002/2026', processo_sei: '111/2026' });
    const r = contagensLicencas([x, y], HOJE, new Map());
    expect(r.revisar).toBe(2);
    expect(r.avisos.processo_repetido).toBe(2);
    expect(r.avisos.numero_fora_padrao).toBe(1);
  });
});
