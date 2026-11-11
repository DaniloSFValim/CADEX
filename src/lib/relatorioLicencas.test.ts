import { describe, expect, it } from 'vitest';
import { COLUNAS_LICENCA_PADRAO, relacaoLicencas } from './relatorioLicencas';
import type { Empresa } from './empresas';
import type { LicencaComTrechos } from './licencas';

const emp = (id: string, teste: boolean): Empresa => ({
  id, codigo_cadex: `CADEX-${id}`, razao_social: `Empresa ${id}`, nome_fantasia: null, cnpj: '11222333000181',
  tipo: 'terceirizada', setores: ['telecom'], situacao: 'deferida', ativa: true, teste, validade_ate: null,
} as Empresa);

const lic = (numero: string, executora: string | null, contratante: string | null): LicencaComTrechos => ({
  id: numero, numero, setor: 'telecom', processo_sei: `P-${numero}`, tipos_obra: ['vala'], escopo: 'x',
  executora_id: executora, contratante_id: contratante, orgao_contratante_id: null, executora_razao_social: null,
  contratante_razao_social: null, contratante_cpf: null, situacao: 'deferida', inicio_previsto: '2026-10-01',
  fim_previsto: '2026-10-30', validade_ate: '2026-10-30', concluida_em: null, licenca_trechos: [],
} as unknown as LicencaComTrechos);

describe('relacaoLicencas', () => {
  const porId = new Map([['real', emp('real', false)], ['teste', emp('teste', true)]]);
  const contexto = { hoje: '2026-10-10', porId };

  it('não exporta licença em que a empresa de teste é executora ou contratante', () => {
    const r = relacaoLicencas(
      [lic('1/2026', 'real', null), lic('2/2026', 'teste', null), lic('3/2026', 'real', 'teste')],
      COLUNAS_LICENCA_PADRAO, contexto, '', []);
    const linhas = r.grupos.flatMap((g) => g.linhas);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toContain('1/2026');
  });

  it('mantém licença de executora sem cadastro (texto livre)', () => {
    const r = relacaoLicencas([lic('4/2026', null, null)], COLUNAS_LICENCA_PADRAO, contexto, '', []);
    expect(r.grupos.flatMap((g) => g.linhas)).toHaveLength(1);
  });
});
