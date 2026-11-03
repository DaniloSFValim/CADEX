import { describe, expect, it } from 'vitest';
import { gerarPdfLicenca, problemasParaLicenca, type DadosLicencaPdf, type TrechoPdf } from './licencaPdf';

const trecho = (i: number): TrechoPdf => ({
  logradouro: `Rua Exemplo ${i}`, bairro: 'Icaraí', referencia: 'Em frente ao nº 10', inicio: '-22.900000, -43.110000', fim: '-22.901000, -43.111000',
});

const base: DadosLicencaPdf = {
  numero: '050/2026', processo_sei: 'NIT-050120/000000/2026', emitida_em: '2026-11-03T12:00:00Z',
  inicio_previsto: '2026-11-10', fim_previsto: '2026-12-01', validade_ate: '2026-12-10',
  tipos: ['Abertura de vala', 'Implantação de poste', 'Instalação ou expansão de rede', 'Ligação de imóvel à rede pública'],
  escolhidos: ['Abertura de vala'], outros_descricao: null,
  escopo: 'Abertura de vala para passagem de rede de distribuição.',
  trechos: [trecho(1)],
  executora: { nome: 'Empresa Fictícia Ltda', cnpj: '00.000.000/0001-00', codigo_cadex: 'CAD-0001', contato: '(21) 0000-0000 · contato@ficticia.test', endereco: 'Rua Um, 10 · Niterói/RJ' },
  subcontratada: null,
  contratante: { nome: 'Operadora Exemplo S.A.', cnpj: '11.111.111/0001-11', codigo_cadex: null, contato: null, endereco: null },
  responsavel_tecnico: { nome: 'Beltrano', conselho: 'CREA', registro_numero: '1234', registro_uf: 'RJ', art_rrt_numero: 'ART 1' },
  fiscal: { nome: 'Fiscal Teste', matricula: '000.001-0' },
  secretaria: { nome: 'Secretária Teste' },
  codigo_publico: 'AB12CD34EF56',
};

async function paginas(bytes: ArrayBuffer): Promise<number> {
  return (new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

describe('licença de obra em via pública', () => {
  it('gera uma única folha com um trecho', async () => {
    const bytes = await gerarPdfLicenca(base);
    expect(new TextDecoder().decode(new Uint8Array(bytes, 0, 5))).toBe('%PDF-');
    expect(await paginas(bytes)).toBe(1);
  });

  it('continua em uma folha com muitos trechos (reduz a escala)', async () => {
    const trechos = Array.from({ length: 12 }, (_, i) => trecho(i + 1));
    const bytes = await gerarPdfLicenca({ ...base, trechos });
    expect(await paginas(bytes)).toBe(1);
  });

  it('a prévia tem uma folha e a mesma estrutura da licença', async () => {
    const previa = await gerarPdfLicenca(base, undefined, undefined, true);
    expect(await paginas(previa)).toBe(1);
  });

  it('exige número, início, trecho e tipo antes de gerar', () => {
    expect(problemasParaLicenca(base)).toEqual([]);
    expect(problemasParaLicenca({ ...base, numero: '  ', inicio_previsto: '', trechos: [], escolhidos: [] })).toHaveLength(4);
  });
});
