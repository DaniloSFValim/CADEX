import { describe, expect, it } from 'vitest';
import {
  CAMPOS_DOCUMENTO, codigoLegivel, dinheiroParaNumero, montarDados, numeroDocumento, validarDados, valorPorExtenso,
  autuadoDoCadastro,
} from './documentos';

describe('valor por extenso', () => {
  it('segue o modelo da fiscalização', () => {
    expect(valorPorExtenso(13043.58)).toBe('TREZE MIL QUARENTA E TRÊS REAIS E CINQUENTA E OITO CENTAVOS');
  });

  it('singular e plural de real e centavo', () => {
    expect(valorPorExtenso(1)).toBe('UM REAL');
    expect(valorPorExtenso(1.01)).toBe('UM REAL E UM CENTAVO');
    expect(valorPorExtenso(2.5)).toBe('DOIS REAIS E CINQUENTA CENTAVOS');
  });

  it('centenas, cem e cento', () => {
    expect(valorPorExtenso(100)).toBe('CEM REAIS');
    expect(valorPorExtenso(101)).toBe('CENTO E UM REAIS');
    expect(valorPorExtenso(250)).toBe('DUZENTOS E CINQUENTA REAIS');
  });

  it('milhares e milhões', () => {
    expect(valorPorExtenso(1000)).toBe('MIL REAIS');
    expect(valorPorExtenso(2000)).toBe('DOIS MIL REAIS');
    expect(valorPorExtenso(1000000)).toBe('UM MILHÃO REAIS');
    expect(valorPorExtenso(2000000)).toBe('DOIS MILHÕES REAIS');
  });

  it('zero centavos não aparece', () => {
    expect(valorPorExtenso(20)).toBe('VINTE REAIS');
  });
});

describe('dinheiro digitado', () => {
  it('aceita formato brasileiro e ponto decimal', () => {
    expect(dinheiroParaNumero('13.043,58')).toBe(13043.58);
    expect(dinheiroParaNumero('R$ 500')).toBe(500);
    expect(dinheiroParaNumero('12.5')).toBe(12.5);
  });

  it('recusa texto e valor malformado', () => {
    expect(dinheiroParaNumero('mil reais')).toBeNull();
    expect(dinheiroParaNumero('1.2.3')).toBeNull();
  });
});

describe('numeração e código', () => {
  it('formata como o modelo: 001 - SFSC', () => {
    expect(numeroDocumento(1)).toBe('001 - SFSC');
    expect(numeroDocumento(42)).toBe('042 - SFSC');
    expect(numeroDocumento(1234)).toBe('1234 - SFSC');
  });

  it('código legível em blocos de quatro', () => {
    expect(codigoLegivel('A1B2C3D4E5F6')).toBe('A1B2-C3D4-E5F6');
  });
});

describe('validação por tipo', () => {
  const base = { local_infracao: 'Rua Teste, 1', data: '2026-10-19', hora: '09:30', processo: '1/2026',
    recebimento: 'Entregue ao autuado', fiscal_nome: 'Fiscal Teste', fiscal_matricula: '000.001-0',
    descricao: 'Fatos', elementos: '', fundamentacao: '', informacoes: '', licenca: '', termo_permissao: '',
    exigencia: 'Regularizar', prazo: '15 dias' };

  it('aceita notificação completa', () => {
    expect(validarDados('notificacao', base)).toEqual([]);
  });

  it('exige valor e prazo na multa', () => {
    const erros = validarDados('auto_infracao', { ...base, infringencia: 'Art. X', sancao: 'Anexo', prazo: '' });
    expect(erros.some((e) => e.startsWith('Valor da multa'))).toBe(true);
    expect(erros.some((e) => e.startsWith('Prazo para pagamento'))).toBe(true);
  });

  it('valor da multa precisa ser maior que zero', () => {
    const erros = validarDados('auto_infracao', { ...base, infringencia: 'Art. X', sancao: 'Anexo', valor: '0' });
    expect(erros.some((e) => e.includes('maior que zero'))).toBe(true);
  });

  it('recebimento só aceita as opções do modelo', () => {
    const erros = validarDados('notificacao', { ...base, recebimento: 'Qualquer coisa' });
    expect(erros.some((e) => e.startsWith('Recebimento'))).toBe(true);
  });

  it('certidão não pede os campos de infração', () => {
    const chaves = CAMPOS_DOCUMENTO.certidao_regularidade.map((c) => c.chave);
    expect(chaves).not.toContain('valor');
    expect(chaves).toContain('texto_certidao');
  });
});

describe('snapshot do documento', () => {
  const autuado = autuadoDoCadastro({
    razao_social: 'Empresa Fictícia Ltda', nome_fantasia: 'Fictícia', cnpj: '00.000.000/0001-00',
    logradouro: 'Rua Um', numero: '10', complemento: 'Sala 2', bairro: 'Centro', cidade: 'Niterói', uf: 'RJ',
    cep: '24000-000', telefone: '21 0000-0000',
  }, 'apta');

  it('copia o cadastro e o valor com extenso', () => {
    const dados = montarDados('auto_infracao', { valor: '13.043,58', prazo: '30 dias' }, autuado);
    expect(dados.valor).toBe(13043.58);
    expect(dados.valor_extenso).toBe('TREZE MIL QUARENTA E TRÊS REAIS E CINQUENTA E OITO CENTAVOS');
    expect((dados.autuado as { endereco: string }).endereco).toBe('Rua Um, 10 - Sala 2 - Centro');
  });

  it('não grava campos vazios', () => {
    const dados = montarDados('embargo', { trecho: 'Trecho 1', elementos: '   ' }, autuado);
    expect(dados).not.toHaveProperty('elementos');
  });
});
