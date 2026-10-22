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

// Cores da identidade, as mesmas da ficha e dos relatórios (tailwind.config.js).
const COR_MARCA: [number, number, number] = [11, 91, 104];
const COR_TINTA: [number, number, number] = [20, 29, 38];
const COR_CINZA: [number, number, number] = [86, 98, 110];
const COR_FIO: [number, number, number] = [205, 212, 216];

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

  /** Seção do termo, no estilo da ficha: título em azul-marca e fio fino embaixo. */
  const secao = (t: string) => {
    y += 3;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...COR_MARCA);
    pdf.text(t.toUpperCase(), MARGEM, y);
    y += 2;
    pdf.setDrawColor(...COR_MARCA).setLineWidth(0.3).line(MARGEM, y, LARGURA - MARGEM, y);
    y += 4;
    pdf.setTextColor(...COR_TINTA);
  };

  /** Campos em duas colunas, como na ficha: rótulo pequeno em cinza e valor embaixo, com fio fino entre as linhas. */
  const grade = (itens: [string, string][]) => {
    const COLUNAS = [MARGEM, 110];
    const LARGURA_CAMPO = 85;
    for (let i = 0; i < itens.length; i += 2) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const celulas = [0, 1].map((k) => {
        const item = itens[i + k];
        return item ? { rotulo: item[0], partes: quebrar(item[1], LARGURA_CAMPO) } : undefined;
      });
      const linhas = Math.max(...celulas.map((c) => c?.partes.length ?? 1));
      celulas.forEach((c, k) => {
        if (!c) return;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...COR_CINZA);
        pdf.text(c.rotulo, COLUNAS[k], y);
        pdf.setFontSize(9);
        pdf.setTextColor(...COR_TINTA);
        pdf.text(c.partes, COLUNAS[k], y + 4);
      });
      // Fio logo abaixo do último valor da linha.
      const fio = y + 4 + (linhas - 1) * 4 + 2.2;
      pdf.setDrawColor(...COR_FIO).setLineWidth(0.2).line(MARGEM, fio, LARGURA - MARGEM, fio);
      y = fio + 2.8;
    }
  };

  /** Termo de compromisso: registro completo da empresa, compromisso e assinatura do representante legal. Uma folha. */
  const corpoTermo = () => {
    const reg = autuado;
    const data = (v: unknown) => (v ? dataExibicao(String(v)) : '—');
    secao('Identificação da empresa');
    grade([
      ['Razão social', texto(reg.razao_social)],
      ['Nome fantasia', texto(reg.nome_fantasia)],
      ['CNPJ', texto(reg.cnpj)],
      ['Código CADEX', texto(reg.codigo_cadex)],
      ['Tipo', texto(reg.tipo_empresa)],
      ['Setores', Array.isArray(reg.setores) && reg.setores.length > 0 ? reg.setores.join(', ') : '—'],
      ['Endereço', texto(reg.endereco)],
      ['Cidade / UF', `${texto(reg.cidade)} / ${texto(reg.uf)}`],
      ['CEP', texto(reg.cep)],
      ['Telefone', texto(reg.telefone)],
      ['E-mail', texto(reg.email)],
    ]);
    secao('Inscrição no CADEX');
    grade([
      ['Situação', texto(reg.situacao_cadastro)],
      ['Processo', texto(reg.processo_numero)],
      ['Data do requerimento', data(reg.data_requerimento)],
      ['Portaria', texto(reg.portaria_numero)],
      ['Publicada em', data(reg.portaria_data)],
      ['Válida até', data(reg.validade_ate)],
    ]);
    secao('Compromisso');
    for (const p of TEXTO_TERMO_COMPROMISSO.compromisso) paragrafo(p);
    secao('Responsabilidade pelas informações');
    for (const p of TEXTO_TERMO_COMPROMISSO.responsabilidade) paragrafo(p);
    y += 6;
    paragrafo(`${texto(dados.local)}, ${data(dados.data)}.`);
    y += 14;
    const centro = LARGURA / 2;
    pdf.setDrawColor(...COR_TINTA).setLineWidth(0.3).line(centro - 60, y, centro + 60, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...COR_TINTA);
    pdf.text(texto(reg.representante), centro, y + 4.5, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COR_CINZA);
    pdf.text('Representante legal da empresa', centro, y + 9, { align: 'center' });
    y += 14;
  };

  // Cabeçalho: brasão na proporção original, órgão e número do documento.
  const ALTURA_BRASAO = 16;
  let recuo = MARGEM;
  if (logo) {
    const { width, height } = pdf.getImageProperties(logo);
    const largura = ALTURA_BRASAO * (width / height);
    pdf.addImage(logo, 'PNG', MARGEM, y, largura, ALTURA_BRASAO);
    recuo = MARGEM + largura + 5;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...COR_TINTA);
  pdf.text('PREFEITURA MUNICIPAL DE NITERÓI', recuo, y + 4.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...COR_CINZA);
  pdf.text('SECRETARIA DE CONSERVAÇÃO E SERVIÇOS PÚBLICOS', recuo, y + 9.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COR_MARCA);
  pdf.text('FISCALIZAÇÃO DE SERVIÇOS CONCEDIDOS', recuo, y + 14);
  pdf.setFontSize(9);
  pdf.setTextColor(...COR_TINTA);
  pdf.text(`Documento nº ${numeroDocumento(doc.numero)}`, LARGURA - MARGEM, y + 4.5, { align: 'right' });
  y += ALTURA_BRASAO + 6;
  pdf.setDrawColor(...COR_FIO).setLineWidth(0.3).line(MARGEM, y, LARGURA - MARGEM, y);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(...COR_TINTA);
  pdf.text(TITULO_DOCUMENTO[doc.tipo].toUpperCase(), LARGURA / 2, y + 9, { align: 'center' });
  y += 14;

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
