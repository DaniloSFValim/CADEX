import { describe, expect, it } from 'vitest';
import { gerarPdfDocumento } from './documentosPdf';
import type { DocumentoOficial } from './documentos';

const registro: DocumentoOficial = {
  id: '00000000-0000-4000-8000-000000000010',
  tipo: 'auto_infracao',
  numero: 7,
  empresa_id: '00000000-0000-4000-8000-000000000011',
  emitido_por: '00000000-0000-4000-8000-000000000001',
  emitido_em: '2026-10-19T12:00:00Z',
  codigo_verificacao: 'A1B2C3D4E5F6',
  dados: {
    autuado: { razao_social: 'Empresa Fictícia Ltda', cnpj: '00.000.000/0001-00', endereco: 'Rua Um, 10',
      cidade: 'Niterói', uf: 'RJ', cep: '24000-000', telefone: '21 0000-0000', nome_fantasia: null },
    local_infracao: 'Rua Teste, 1', data: '2026-10-19', hora: '09:30', processo: '1/2026',
    descricao: 'Fatos verificados em vistoria.', infringencia: 'Art. X', sancao: 'Anexo Único',
    valor: 13043.58, valor_extenso: 'TREZE MIL QUARENTA E TRÊS REAIS E CINQUENTA E OITO CENTAVOS',
    prazo: '30 dias', recebimento: 'Entregue ao autuado', fiscal_nome: 'Fiscal Teste', fiscal_matricula: '000.001-0',
  },
};

describe('PDF do documento emitido', () => {
  it('gera um PDF válido', async () => {
    const bytes = await gerarPdfDocumento(registro);
    expect(new TextDecoder().decode(new Uint8Array(bytes, 0, 5))).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('gera de novo a partir do mesmo registro sem depender de cadastro', async () => {
    const a = await gerarPdfDocumento(registro);
    const b = await gerarPdfDocumento(registro);
    expect(a.byteLength).toBe(b.byteLength);
  });
});
