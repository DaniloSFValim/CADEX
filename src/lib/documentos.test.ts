import { describe, expect, it } from 'vitest';
import {
  CAMPOS_DOCUMENTO, TIPOS_DOCUMENTO, TITULO_DOCUMENTO, TEXTO_TERMO_COMPROMISSO, textoCertidaoRegularidade, codigoLegivel, dinheiroParaNumero,
  montarDados, numeroDocumento, registroDoCadastro, validadeDocumento, validarDados, valorPorExtenso, autuadoDoCadastro,
} from './documentos';
import type { Empresa } from './empresas';

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

describe('validade de certidão e termo', () => {
  it('vale um ano a partir da emissão', () => {
    expect(validadeDocumento('2026-10-19T12:00:00Z')).toBe('2027-10-19');
  });

  it('em 29 de fevereiro cai em 28 de fevereiro quando o ano seguinte não é bissexto', () => {
    expect(validadeDocumento('2028-02-29T12:00:00Z')).toBe('2029-02-28');
  });

  it('usa a data de Brasília: emissão às 22h de 31/12 já é 31/12', () => {
    expect(validadeDocumento('2026-01-01T01:00:00Z')).toBe('2026-12-31');
  });
});

describe('numeração e código', () => {
  it('formata como o modelo, com o ano da emissão: 001/2026 - SFSC', () => {
    expect(numeroDocumento(1, 'notificacao', '2026-03-10T12:00:00Z')).toBe('NOT-001/2026 - SFSC');
    expect(numeroDocumento(42, 'certidao_regularidade', '2026-03-10T12:00:00Z')).toBe('CER-042/2026 - SFSC');
    expect(numeroDocumento(1234, 'termo_compromisso', '2026-03-10T12:00:00Z')).toBe('TCR-1234/2026 - SFSC');
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

  it('certidão só pede o fiscal: texto e dados vêm do cadastro', () => {
    const chaves = CAMPOS_DOCUMENTO.certidao_regularidade.map((c) => c.chave);
    expect(chaves).toEqual(['fiscal_nome', 'fiscal_matricula']);
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

describe('termo de compromisso', () => {
  const empresa = {
    id: 'e1', codigo_cadex: 'CADEX-TER-2026-0001', cnpj: '00000000000100', razao_social: 'Empresa Fictícia Ltda',
    nome_fantasia: 'Fictícia', tipo: 'terceirizada', setores: ['telecom', 'viario'], email: 'contato@ficticia.test',
    telefone: '21 0000-0000', cep: '24000000', logradouro: 'Rua Um', numero: '10', complemento: null, bairro: 'Centro',
    cidade: 'Niterói', uf: 'RJ', observacoes: null, representante: 'Maria Teste', ativa: true, executa_obras: false,
    situacao: 'apta', processo_numero: '1/2026', data_requerimento: '2026-01-10', portaria_numero: 'Portaria 12/2026',
    portaria_data: '2026-02-01', validade_ate: '2027-02-01', notificacao_data: null, logo_arquivo: null,
    criado_em: '2026-01-01', atualizado_em: '2026-01-01',
  } as unknown as Empresa;

  it('está na lista de tipos e tem título próprio', () => {
    expect(TIPOS_DOCUMENTO).toContain('termo_compromisso');
    expect(TITULO_DOCUMENTO.termo_compromisso).toBe('Termo de Compromisso e Responsabilidade');
  });

  it('exige local e data, e nenhum campo de infração', () => {
    expect(validarDados('termo_compromisso', {})).toEqual(['Local: obrigatório.', 'Data da assinatura: obrigatório.']);
    expect(validarDados('termo_compromisso', { local: 'Niterói', data: '2026-10-22' })).toEqual([]);
    expect(CAMPOS_DOCUMENTO.termo_compromisso.map((c) => c.chave)).toEqual(['local', 'data']);
  });

  it('copia o registro completo da empresa, com rótulos legíveis', () => {
    const r = registroDoCadastro(empresa);
    expect(r.codigo_cadex).toBe('CADEX-TER-2026-0001');
    expect(r.tipo_empresa).toBe('Terceirizada');
    expect(r.setores).toEqual(['Telecomunicações', 'Viário / mobilidade']);
    expect(r.representante).toBe('Maria Teste');
    expect(r.portaria_numero).toBe('Portaria 12/2026');
    expect(r.validade_ate).toBe('2027-02-01');
    expect(r.endereco).toBe('Rua Um, 10 - Centro');
  });

  it('a certidão cita o cadastro e não traz dados de infração', () => {
    const texto = textoCertidaoRegularidade(registroDoCadastro(empresa), '2026-10-22T13:00:00Z').join(' ');
    expect(texto).toContain('CADEX-TER-2026-0001');
    expect(texto).toContain('Portaria 12/2026');
    expect(texto).toContain('inscrição prévia e ativa');
    expect(texto).not.toMatch(/infra|multa|notifica|auto de/i);
  });

  it('o texto tem o compromisso e a responsabilidade pelas informações', () => {
    expect(TEXTO_TERMO_COMPROMISSO.compromisso.join(' ')).toContain('Resolução Conjunta SECONSER/SEOP nº 001/2026');
    expect(TEXTO_TERMO_COMPROMISSO.responsabilidade.join(' ')).toContain('responde por elas');
  });
});
