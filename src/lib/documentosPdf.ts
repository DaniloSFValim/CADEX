import type { DocumentoOficial, TipoDocumento } from './documentos';
import {
  CAMPOS_DOCUMENTO, TEXTO_TERMO_COMPROMISSO, TITULO_DOCUMENTO, codigoLegivel, dataExibicao, instanteExibicao, numeroDocumento,
} from './documentos';

/**
 * PDF de um documento já emitido. Lê só o registro guardado: se o cadastro
 * da empresa mudar depois, o documento continua como foi emitido.
 */

const MARGEM = 15;
const LARGURA = 210;
const ALTURA_UTIL = 297 - 22;

type Dados = Record<string, unknown>;

/** Campos que têm bloco próprio no layout e não entram no corpo genérico. */
const CHAVES_FIXAS = new Set(['local_infracao', 'data', 'hora', 'processo', 'licenca', 'termo_permissao',
  'recebimento', 'fiscal_nome', 'fiscal_matricula']);

function texto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  return String(valor);
}

function reais(valor: unknown): string {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return '—';
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Linha de itens do cadastro do autuado. */
function linhasAutuado(autuado: Dados, tipo: TipoDocumento): [string, string][] {
  const linhas: [string, string][] = [
    ['Razão social', texto(autuado.razao_social)],
    ['Nome fantasia', texto(autuado.nome_fantasia)],
    ['CPF/CNPJ', texto(autuado.cnpj)],
    ['Endereço', texto(autuado.endereco)],
    ['Cidade / UF', `${texto(autuado.cidade)} / ${texto(autuado.uf)}`],
    ['CEP', texto(autuado.cep)],
    ['Telefone', texto(autuado.telefone)],
  ];
  if (tipo === 'certidao_regularidade') linhas.push(['Situação no cadastro', texto(autuado.situacao_cadastro)]);
  return linhas;
}

/** Valor de um campo do corpo, já formatado para o documento. */
function valorDoCampo(tipo: TipoDocumento, chave: string, dados: Dados): string | null {
  const campo = CAMPOS_DOCUMENTO[tipo].find((c) => c.chave === chave);
  if (!campo) return null;
  const bruto = dados[chave];
  if (bruto === undefined || bruto === null || bruto === '') return null;
  if (campo.tipo === 'dinheiro') {
    const extenso = dados[`${chave}_extenso`];
    return `${reais(bruto)}${extenso ? ` (${extenso})` : ''}`;
  }
  if (campo.tipo === 'data') return dataExibicao(String(bruto));
  return String(bruto);
}

export async function gerarPdfDocumento(doc: DocumentoOficial, logo?: string): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const dados = doc.dados as Dados;
  const autuado = (dados.autuado ?? {}) as Dados;
  let y = MARGEM;

  const quebrar = (t: string, largura: number) => pdf.splitTextToSize(t, largura) as string[];
  const garantir = (altura: number) => {
    if (y + altura > ALTURA_UTIL) {
      pdf.addPage();
      y = MARGEM;
    }
  };
  const titulo = (t: string) => {
    garantir(10);
    y += 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(t.toUpperCase(), MARGEM, y);
    y += 1.5;
    pdf.setDrawColor(120);
    pdf.line(MARGEM, y, LARGURA - MARGEM, y);
    y += 4;
  };
  const COLUNA_ROTULO = 58;
  const linha = (rotulo: string, valor: string) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    const rotulos = quebrar(rotulo, COLUNA_ROTULO - 4);
    pdf.setFont('helvetica', 'normal');
    const partes = quebrar(valor, LARGURA - 2 * MARGEM - COLUNA_ROTULO);
    const altura = Math.max(rotulos.length, partes.length) * 4.5 + 1;
    garantir(altura);
    pdf.setFont('helvetica', 'bold');
    pdf.text(rotulos, MARGEM, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(partes, MARGEM + COLUNA_ROTULO, y);
    y += altura;
  };
  const paragrafo = (t: string) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const partes = quebrar(t, LARGURA - 2 * MARGEM);
    garantir(partes.length * 4.5 + 1);
    pdf.text(partes, MARGEM, y);
    y += partes.length * 4.5 + 1;
  };

  /** Termo de compromisso: registro completo da empresa, compromisso e assinatura do representante legal. */
  const corpoTermo = () => {
    const reg = autuado;
    const data = (v: unknown) => (v ? dataExibicao(String(v)) : '—');
    titulo('Identificação da empresa');
    linha('Razão social', texto(reg.razao_social));
    linha('Nome fantasia', texto(reg.nome_fantasia));
    linha('CNPJ', texto(reg.cnpj));
    linha('Código CADEX', texto(reg.codigo_cadex));
    linha('Tipo', texto(reg.tipo_empresa));
    linha('Setores', Array.isArray(reg.setores) && reg.setores.length > 0 ? reg.setores.join(', ') : '—');
    linha('Endereço', texto(reg.endereco));
    linha('Cidade / UF', `${texto(reg.cidade)} / ${texto(reg.uf)}`);
    linha('CEP', texto(reg.cep));
    linha('Telefone', texto(reg.telefone));
    linha('E-mail', texto(reg.email));
    titulo('Inscrição no CADEX');
    linha('Situação', texto(reg.situacao_cadastro));
    linha('Processo', texto(reg.processo_numero));
    linha('Data do requerimento', data(reg.data_requerimento));
    linha('Portaria', texto(reg.portaria_numero));
    linha('Publicada em', data(reg.portaria_data));
    linha('Válida até', data(reg.validade_ate));
    titulo('Compromisso');
    for (const p of TEXTO_TERMO_COMPROMISSO.compromisso) paragrafo(p);
    titulo('Responsabilidade pelas informações');
    for (const p of TEXTO_TERMO_COMPROMISSO.responsabilidade) paragrafo(p);
    garantir(38);
    y += 6;
    paragrafo(`${texto(dados.local)}, ${data(dados.data)}.`);
    y += 12;
    const centro = LARGURA / 2;
    pdf.setDrawColor(0);
    pdf.line(centro - 55, y, centro + 55, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(texto(reg.representante), centro, y + 4.5, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.text('Representante legal da empresa, assinatura', centro, y + 9, { align: 'center' });
    y += 16;
  };

  // Cabeçalho: brasão e órgão, como no modelo da fiscalização.
  if (logo) {
    pdf.addImage(logo, 'PNG', MARGEM, y, 18, 18);
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('PREFEITURA MUNICIPAL DE NITERÓI', logo ? MARGEM + 22 : MARGEM, y + 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text('SECRETARIA DE CONSERVAÇÃO E SERVIÇOS PÚBLICOS', logo ? MARGEM + 22 : MARGEM, y + 9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('FISCALIZAÇÃO DE SERVIÇOS CONCEDIDOS', logo ? MARGEM + 22 : MARGEM, y + 14);
  pdf.setFontSize(9);
  pdf.text(`Documento nº ${numeroDocumento(doc.numero)}`, LARGURA - MARGEM, y + 4, { align: 'right' });
  y += 24;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(TITULO_DOCUMENTO[doc.tipo].toUpperCase(), LARGURA / 2, y + 4, { align: 'center' });
  y += 12;

  if (doc.tipo === 'termo_compromisso') {
    corpoTermo();
  } else {
    titulo('Identificação do autuado');
    for (const [r, v] of linhasAutuado(autuado, doc.tipo)) linha(r, v);

    titulo('Fato');
    linha('Local da infração', texto(dados.local_infracao));
    linha('Data e hora', `${dados.data ? dataExibicao(String(dados.data)) : '—'} às ${texto(dados.hora)}`);
    linha('Processo', texto(dados.processo));
    if (dados.licenca) linha('Licença nº', String(dados.licenca));
    if (dados.termo_permissao) linha('Termo de permissão', String(dados.termo_permissao));

    const corpo = CAMPOS_DOCUMENTO[doc.tipo].filter((c) => !CHAVES_FIXAS.has(c.chave) && !c.chave.startsWith('fiscal_'));
    const campos = corpo.filter((c) => c.tipo !== 'area' || dados[c.chave]);
    if (campos.length > 0) titulo('Conteúdo');
    for (const c of campos) {
      const v = valorDoCampo(doc.tipo, c.chave, dados);
      if (c.tipo === 'area' && v) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        garantir(6);
        pdf.text(c.rotulo, MARGEM, y);
        y += 4.5;
        paragrafo(v);
      } else if (v) {
        linha(c.rotulo, v);
      }
    }

    titulo('Recebimento');
    paragrafo(texto(dados.recebimento));

    // Assinaturas: o fiscal assina pelo gov.br; o campo do autuado mantém a
    // situação de recebimento registrada acima.
    garantir(44);
    y += 8;
    const meio = LARGURA / 2;
    pdf.setDrawColor(0);
    pdf.line(MARGEM, y, meio - 8, y);
    pdf.line(meio + 8, y, LARGURA - MARGEM, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text('Assinatura e identificação do fiscal autuante', MARGEM, y + 4);
    pdf.text(`${texto(dados.fiscal_nome)} - Matr.: ${texto(dados.fiscal_matricula)}`, MARGEM, y + 8);
    pdf.text('Assinatura do autuado', meio + 8, y + 4);
    pdf.text(texto(dados.recebimento), meio + 8, y + 8);
    y += 14;
  }

  // Rodapé em todas as páginas: código de verificação e página.
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(90);
    pdf.text(
      `Código de verificação: ${codigoLegivel(doc.codigo_verificacao)} · Emitido em ${instanteExibicao(doc.emitido_em)} · Página ${i} de ${total}`,
      LARGURA / 2, 290, { align: 'center' },
    );
    pdf.setTextColor(0);
  }

  return pdf.output('arraybuffer');
}
