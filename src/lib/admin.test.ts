import { describe, expect, it } from 'vitest';
import type { Empresa } from './empresas';
import type { LicencaComTrechos } from './licencas';
import { duplicidades, inconsistencias, normalizarNome, participacoes } from './admin';

const HOJE = '2026-10-13';

const emp = (id: string, over: Partial<Empresa> = {}): Empresa => ({
  id, codigo_cadex: `X-${id}`, cnpj: '00000000000191', razao_social: `${id} LTDA`, nome_fantasia: null, tipo: 'operadora',
  setores: ['telecom'], email: 'x@y.z', telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
  bairro: null, cidade: null, uf: null, representante: null, observacoes: null, situacao: 'deferida', processo_numero: null,
  data_requerimento: null, portaria_numero: null, portaria_data: null, validade_ate: '2027-12-31', notificacao_data: null,
  logo_arquivo: null, ativa: true, criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-01T00:00:00Z', ...over,
});

let seq = 0;
const lic = (o: Partial<LicencaComTrechos> = {}): LicencaComTrechos => {
  seq++;
  return {
    id: `l${seq}`, setor: 'telecom', processo_sei: `P-${String(seq).padStart(3, '0')}`, numero: `${seq}/2026`, tipos_obra: ['vala'], escopo: 'x',
    executora_id: 'op1', contratante_id: null, orgao_contratante_id: null, executora_razao_social: null, executora_cnpj: null,
    contratante_razao_social: null, contratante_cnpj: null, contratante_cpf: null, imovel_endereco: null, processo_urbanismo: null,
    anterior_resolucao: false, subcontratada_id: null, responsavel_tecnico_id: null, art_numero: null, protocolo_data: '2026-09-10',
    situacao: 'deferida', decisao_data: '2026-09-15', inicio_previsto: '2026-10-01', fim_previsto: '2026-10-30', concluida_em: null,
    recomposicao_data: null, as_built_sei: null, as_built_data: null, observacoes: null, empresas_no_deferimento: null,
    codigo_publico: `c${seq}`, criado_em: '2026-09-16T10:00:00Z', atualizado_em: '2026-09-16T10:00:00Z',
    licenca_trechos: [{ id: 't', ordem: 1, logradouro: 'Rua A', bairro: null, referencia: null, inicio_lat: -22.9, inicio_lng: -43.1, fim_lat: null, fim_lng: null }],
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
  it('fim vencido sem conclusão', () => {
    expect(acha(lic({ inicio_previsto: '2026-08-01', fim_previsto: '2026-09-01' }))).toContain('Fim da obra ou serviço vencido, sem conclusão registrada.');
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
    const muitos = lic({ executora_id: 'off', licenca_trechos: [], inicio_previsto: '2026-08-01', fim_previsto: '2026-09-01' });
    const um = lic({ licenca_trechos: [] });
    const r = inconsistencias([um, muitos], HOJE, empresas);
    expect(r[0].licenca).toBe(muitos);
  });
});
