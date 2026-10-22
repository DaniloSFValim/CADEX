import type { DocumentoOficial, RegistroDoCadastro, ResponsavelDoCadastro, TipoDocumento } from './documentos';
import {
  CAMPOS_DOCUMENTO, TEXTO_TERMO_COMPROMISSO, TITULO_DOCUMENTO, codigoLegivel, dataExibicao, instanteExibicao, numeroDocumento,
  textoCertidaoRegularidade,
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

/** Campos com bloco próprio no layout, fora do corpo genérico. */
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

/** Itens do cadastro da empresa, como pares rótulo-valor. */
function pairsDoCadastro(reg: Dados): [string, string][] {
  return [
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
  ];
}

/** Texto de um responsável técnico: nome, conselho, registro e ART/RRT. Sem CPF. */
function textoResponsavel(rt: ResponsavelDoCadastro): string {
  const registro = `${rt.conselho} ${rt.registro_numero}${rt.registro_uf ? ` / ${rt.registro_uf.trim()}` : ''}`;
  return `${rt.nome} · ${registro}${rt.art_rrt_numero ? ` · ART/RRT ${rt.art_rrt_numero}` : ''}`;
}

/** Texto da tarja: o que vale o documento, sem depender de conferir o cadastro. */
function tarjaDoDocumento(doc: DocumentoOficial, validadeCertidao: string | null): string {
  if (doc.tipo === 'certidao_regularidade') {
    return validadeCertidao
      ? `Certidão válida até ${dataExibicao(validadeCertidao)}, enquanto a inscrição permanecer APTA. A situação atual está no QR Code.`
      : 'Certidão de regularidade. A situação atual da inscrição está no QR Code.';
  }
  if (doc.tipo === 'termo_compromisso') {
    return 'Termo sem prazo próprio: vale enquanto a inscrição da empresa estiver vigente. Confira a situação atual no QR Code.';
  }
  return 'Documento oficial da fiscalização. Confira a autenticidade no QR Code.';
}

/**
 * Termo e certidão precisam caber em uma folha. Primeiro sai no tamanho normal;
 * se passar de uma página, refaz em modo compacto (fontes e espaços menores).
 */
export async function gerarPdfDocumento(
  doc: DocumentoOficial,
  logo?: string,
  origem: string = typeof window !== 'undefined' ? window.location.origin : '',
): Promise<ArrayBuffer> {
  const normal = await montarPdf(doc, logo, origem, false);
  const umaFolha = doc.tipo === 'termo_compromisso' || doc.tipo === 'certidao_regularidade';
  if (!umaFolha || normal.paginas === 1) return normal.bytes;
  return (await montarPdf(doc, logo, origem, true)).bytes;
}

async function montarPdf(
  doc: DocumentoOficial,
  logo: string | undefined,
  origem: string,
  compacta: boolean,
): Promise<{ bytes: ArrayBuffer; paginas: number }> {
  const { jsPDF } = await import('jspdf');
  const QRCode = (await import('qrcode')).default;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const dados = doc.dados as Dados;
  const autuado = (dados.autuado ?? {}) as Dados;
  const data = (v: unknown) => (v ? dataExibicao(String(v)) : '—');
  let y = MARGEM;

  const quebrar = (t: string, largura: number) => pdf.splitTextToSize(t, largura) as string[];
  const garantir = (altura: number) => {
    if (y + altura > ALTURA_UTIL) {
      pdf.addPage();
      y = MARGEM;
    }
  };

  /** Seção: título em azul-marca e fio fino embaixo, como na ficha. */
  const secao = (t: string) => {
    garantir(16);
    y += compacta ? 1 : 2;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...COR_MARCA);
    pdf.text(t.toUpperCase(), MARGEM, y);
    y += 2;
    pdf.setDrawColor(...COR_MARCA).setLineWidth(0.3).line(MARGEM, y, LARGURA - MARGEM, y);
    y += 4;
    pdf.setTextColor(...COR_TINTA);
  };

  /** Campos em duas colunas: rótulo pequeno em cinza e valor embaixo, com fio fino entre as linhas. */
  const grade = (itens: [string, string][]) => {
    const COLUNAS = [MARGEM, 110];
    const LARGURA_CAMPO = 85;
    for (let i = 0; i < itens.length; i += 2) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(compacta ? 8 : 9);
      const celulas = [0, 1].map((k) => {
        const item = itens[i + k];
        return item ? { rotulo: item[0], partes: quebrar(item[1], LARGURA_CAMPO) } : undefined;
      });
      const linhas = Math.max(...celulas.map((c) => c?.partes.length ?? 1));
      garantir(linhas * 4 + 7);
      celulas.forEach((c, k) => {
        if (!c) return;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...COR_CINZA);
        pdf.text(c.rotulo, COLUNAS[k], y);
        pdf.setFontSize(compacta ? 8 : 9);
        pdf.setTextColor(...COR_TINTA);
        pdf.text(c.partes, COLUNAS[k], y + 4);
      });
      // Fio logo abaixo do último valor da linha.
      const fio = y + 4 + (linhas - 1) * 4 + 2.2;
      pdf.setDrawColor(...COR_FIO).setLineWidth(0.2).line(MARGEM, fio, LARGURA - MARGEM, fio);
      y = fio + 2.8;
    }
  };

  const paragrafo = (t: string, tamanho = compacta ? 8 : 9) => {
    const entrelinha = tamanho * 0.5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(tamanho);
    pdf.setTextColor(...COR_TINTA);
    const partes = quebrar(t, LARGURA - 2 * MARGEM);
    garantir(partes.length * entrelinha + 1);
    pdf.text(partes, MARGEM, y);
    y += partes.length * entrelinha + 1;
  };

  /** Assinaturas: uma ou duas colunas, cada uma com linha, nome e descrição. */
  const assinaturas = (blocos: { nome: string; descricao: string }[]) => {
    garantir(26);
    y += compacta ? 5 : 10;
    const colunas = blocos.length === 1 ? [LARGURA / 2] : [LARGURA / 4 + MARGEM / 2, (3 * LARGURA) / 4 - MARGEM / 2];
    blocos.forEach((b, i) => {
      const cx = colunas[i];
      pdf.setDrawColor(...COR_TINTA).setLineWidth(0.3).line(cx - 35, y, cx + 35, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COR_TINTA);
      pdf.text(b.nome, cx, y + 4.5, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...COR_CINZA);
      pdf.text(b.descricao, cx, y + 8.5, { align: 'center' });
    });
    y += 12;
  };

  /** Termo de compromisso: registro completo da empresa, compromisso e assinatura do representante legal. */
  const corpoTermo = () => {
    const reg = autuado as unknown as RegistroDoCadastro;
    secao('Identificação da empresa');
    grade(pairsDoCadastro(autuado));
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
    y += 4;
    paragrafo(`${texto(dados.local)}, ${data(dados.data)}.`);
    assinaturas([{ nome: texto(reg.representante), descricao: 'Representante legal da empresa' }]);
  };

  /** Certidão de regularidade: empresa, responsável técnico, texto gerado do cadastro e assinatura do fiscal. */
  const corpoCertidao = () => {
    const reg = autuado as unknown as RegistroDoCadastro;
    secao('Identificação da empresa');
    grade(pairsDoCadastro(autuado));
    secao('Responsável técnico');
    const rts = Array.isArray(reg.responsaveis) ? reg.responsaveis : [];
    if (rts.length === 0) {
      paragrafo('Nenhum responsável técnico ativo cadastrado na data de emissão.');
    } else {
      for (const rt of rts) paragrafo(textoResponsavel(rt));
    }
    secao('Certidão');
    for (const p of textoCertidaoRegularidade(reg, doc.emitido_em)) paragrafo(p);
    assinaturas([{
      nome: texto(dados.fiscal_nome),
      descricao: `Fiscal responsável pela emissão · Matrícula ${texto(dados.fiscal_matricula)}`,
    }]);
  };

  /** Autos (notificação, infração, embargo, apreensão): identificação, fato, conteúdo e recebimento. */
  const corpoAuto = () => {
    secao('Identificação do autuado');
    grade([
      ['Razão social', texto(autuado.razao_social)],
      ['Nome fantasia', texto(autuado.nome_fantasia)],
      ['CPF/CNPJ', texto(autuado.cnpj)],
      ['Endereço', texto(autuado.endereco)],
      ['Cidade / UF', `${texto(autuado.cidade)} / ${texto(autuado.uf)}`],
      ['CEP', texto(autuado.cep)],
      ['Telefone', texto(autuado.telefone)],
    ]);

    secao('Fato');
    const fato: [string, string][] = [
      ['Local da infração', texto(dados.local_infracao)],
      ['Data e hora', `${dados.data ? dataExibicao(String(dados.data)) : '—'} às ${texto(dados.hora)}`],
      ['Processo', texto(dados.processo)],
    ];
    if (dados.licenca) fato.push(['Licença nº', String(dados.licenca)]);
    if (dados.termo_permissao) fato.push(['Termo de permissão', String(dados.termo_permissao)]);
    grade(fato);

    const corpo = CAMPOS_DOCUMENTO[doc.tipo].filter((c) => !CHAVES_FIXAS.has(c.chave) && !c.chave.startsWith('fiscal_'));
    const campos = corpo.filter((c) => c.tipo !== 'area' || dados[c.chave]);
    const pares: [string, string][] = [];
    const textos: { rotulo: string; valor: string }[] = [];
    for (const c of campos) {
      const v = valorDoCampo(doc.tipo, c.chave, dados);
      if (!v) continue;
      if (c.tipo === 'area') textos.push({ rotulo: c.rotulo, valor: v });
      else pares.push([c.rotulo, v]);
    }
    if (pares.length > 0 || textos.length > 0) secao('Conteúdo');
    grade(pares);
    for (const t of textos) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...COR_CINZA);
      garantir(8);
      pdf.text(t.rotulo, MARGEM, y);
      y += 4;
      paragrafo(t.valor);
    }

    secao('Recebimento');
    paragrafo(texto(dados.recebimento));

    // O fiscal assina com a identificação do cadastro; o autuado registra a situação de recebimento.
    assinaturas([
      { nome: texto(dados.fiscal_nome), descricao: `Fiscal autuante · Matrícula ${texto(dados.fiscal_matricula)}` },
      { nome: 'Autuado', descricao: texto(dados.recebimento) },
    ]);
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
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(...COR_TINTA);
  pdf.text(`Documento nº ${numeroDocumento(doc.numero, doc.tipo)}`, LARGURA - MARGEM, y + 4.5, { align: 'right' });
  y += ALTURA_BRASAO + 6;
  pdf.setDrawColor(...COR_FIO).setLineWidth(0.3).line(MARGEM, y, LARGURA - MARGEM, y);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(...COR_TINTA);
  pdf.text(TITULO_DOCUMENTO[doc.tipo].toUpperCase(), LARGURA / 2, y + 9, { align: 'center' });
  y += 14;

  if (doc.tipo === 'termo_compromisso') corpoTermo();
  else if (doc.tipo === 'certidao_regularidade') corpoCertidao();
  else corpoAuto();

  // Tarja e QR Code de verificação, sempre na última página, acima do rodapé.
  const BLOCO_Y = 269;
  if (y > BLOCO_Y - 3) pdf.addPage();
  const compacto = doc.codigo_verificacao.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const validadeCertidao = doc.tipo === 'certidao_regularidade'
    ? (((dados.autuado ?? {}) as Dados).validade_ate as string | null) ?? null
    : null;
  pdf.setFillColor(238, 246, 246);
  pdf.rect(MARGEM, BLOCO_Y, LARGURA - 2 * MARGEM, 5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COR_MARCA);
  pdf.text(quebrar(tarjaDoDocumento(doc, validadeCertidao), LARGURA - 2 * MARGEM - 4)[0], MARGEM + 2, BLOCO_Y + 3.4);
  const qr = await QRCode.toDataURL(`${origem}/documento/${compacto}`, { margin: 0, errorCorrectionLevel: 'M', width: 240 });
  pdf.addImage(qr, 'PNG', MARGEM, BLOCO_Y + 6.5, 15, 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COR_CINZA);
  pdf.text('Verifique a autenticidade e a situação atual em:', MARGEM + 18, BLOCO_Y + 9.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COR_TINTA);
  pdf.text(`${origem.replace(/^https?:\/\//, '')}/documento/${codigoLegivel(doc.codigo_verificacao)}`, MARGEM + 18, BLOCO_Y + 13.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COR_CINZA);
  pdf.text('Ou aponte a câmera para o QR Code.', MARGEM + 18, BLOCO_Y + 17.5);

  // Rodapé em todas as páginas: código de verificação e página.
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COR_CINZA);
    pdf.text(
      `Código de verificação: ${codigoLegivel(doc.codigo_verificacao)} · Emitido em ${instanteExibicao(doc.emitido_em)} · Página ${i} de ${total}`,
      LARGURA / 2, 293, { align: 'center' },
    );
  }

  return { bytes: pdf.output('arraybuffer'), paginas: pdf.getNumberOfPages() };
}
