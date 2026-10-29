import type { DocumentoOficial, RegistroDoCadastro, ResponsavelDoCadastro, TipoDocumento } from './documentos';
import {
  CAMPOS_DOCUMENTO, RECEBIMENTO, TEXTO_DEFESA_AUTO, TEXTO_TERMO_COMPROMISSO, TITULO_DOCUMENTO, codigoLegivel, dataExibicao,
  instanteExibicao, numeroDocumento, textoCertidaoRegularidade, validadeDocumento,
} from './documentos';

/**
 * PDF de um documento já emitido. Lê só o registro guardado: se o cadastro
 * da empresa mudar depois, o documento continua como foi emitido.
 *
 * Todo documento é uma única folha A4. O layout é feito numa escala; se o
 * conteúdo não cabe, tenta-se a escala seguinte, menor, até caber.
 */

const MARGEM = 15;
const LARGURA = 210;
/** Último ponto do corpo. Acima da tarja de verificação (BLOCO_Y) e do rodapé. */
const LIMITE_CORPO = 264;
const BLOCO_Y = 269;
/** Escalas tentadas em ordem: a primeira em que tudo cabe numa folha vence. */
const ESCALAS = [1, 0.95, 0.9, 0.85, 0.8, 0.75];

// Cores da identidade, as mesmas da ficha e dos relatórios (tailwind.config.js).
const COR_MARCA: [number, number, number] = [11, 91, 104];
const COR_TINTA: [number, number, number] = [20, 29, 38];
const COR_CINZA: [number, number, number] = [86, 98, 110];
const COR_FIO: [number, number, number] = [205, 212, 216];

type Dados = Record<string, unknown>;

/** Campos com bloco próprio no layout, fora do corpo genérico. */
const CHAVES_FIXAS = new Set(['local_infracao', 'data', 'hora', 'processo', 'licenca', 'termo_permissao',
  'recebimento', 'fiscal_nome', 'fiscal_matricula']);

/** Conteúdo que não cabe na escala atual. Interno: quem chama tenta a próxima escala. */
class ErroNaoCabe extends Error {}

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

/** Texto da tarja: o que vale o documento. Certidão e termo valem um ano da emissão. */
function tarjaDoDocumento(doc: DocumentoOficial): string {
  if (doc.tipo === 'certidao_regularidade') {
    return `Certidão válida até ${dataExibicao(validadeDocumento(doc.emitido_em))}. A situação atual da inscrição está no QR Code.`;
  }
  if (doc.tipo === 'termo_compromisso') {
    return `Termo válido até ${dataExibicao(validadeDocumento(doc.emitido_em))}. Confira a situação atual da inscrição no QR Code.`;
  }
  return `${TITULO_DOCUMENTO[doc.tipo]} ${numeroDocumento(doc.numero, doc.tipo, doc.emitido_em)}. Confira a autenticidade no QR Code.`;
}

/**
 * Gera o PDF numa única folha A4. Tenta a escala normal; se não couber,
 * reduz as fontes e os espaços até caber. Se nem na menor escala couber, falha
 * em vez de emitir um documento com mais de uma folha.
 */
export async function gerarPdfDocumento(
  doc: DocumentoOficial,
  logo?: string,
  origem: string = typeof window !== 'undefined' ? window.location.origin : '',
): Promise<ArrayBuffer> {
  for (const escala of ESCALAS) {
    try {
      return await montarPdf(doc, logo, origem, escala);
    } catch (erro) {
      if (!(erro instanceof ErroNaoCabe)) throw erro;
    }
  }
  throw new Error('O documento não cabe em uma folha A4 mesmo na menor escala. Avise o suporte.');
}

async function montarPdf(
  doc: DocumentoOficial,
  logo: string | undefined,
  origem: string,
  k: number,
): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf');
  const QRCode = (await import('qrcode')).default;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const dados = doc.dados as Dados;
  const autuado = (dados.autuado ?? {}) as Dados;
  const data = (v: unknown) => (v ? dataExibicao(String(v)) : '—');
  const LARG_UTIL = LARGURA - 2 * MARGEM;
  const tamanhoCampo = 9 * k;
  const passo = 4 * k;
  let y = MARGEM;

  const quebrar = (t: string, largura: number) => pdf.splitTextToSize(t, largura) as string[];
  /** Reserva altura no corpo. Se não couber na folha, a escala atual falha. */
  const garantir = (altura: number) => {
    if (y + altura > LIMITE_CORPO) throw new ErroNaoCabe();
  };

  /** Borda fina, como nos formulários e certidões impressas. */
  const caixa = (x: number, yy: number, w: number, h: number) => {
    pdf.setDrawColor(...COR_FIO).setLineWidth(0.3).rect(x, yy, w, h);
  };

  /** Faixa de título: fundo azul-marca e texto em branco, como nas certidões on-line. */
  const faixa = (titulo: string) => {
    garantir(12 * k);
    pdf.setFillColor(...COR_MARCA);
    pdf.rect(MARGEM, y, LARG_UTIL, 9 * k, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11 * k);
    pdf.setTextColor(255, 255, 255);
    pdf.text(titulo, LARGURA / 2, y + 6 * k, { align: 'center' });
    pdf.setTextColor(...COR_TINTA);
    y += 11 * k;
  };

  /** Seção numerada, como nos atos da fiscalização. */
  let numeroSecao = 0;
  const secao = (titulo: string) => {
    numeroSecao += 1;
    garantir(12 * k);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5 * k);
    pdf.setTextColor(...COR_MARCA);
    pdf.text(`${numeroSecao}. ${titulo.toUpperCase()}`, MARGEM, y + 4 * k);
    pdf.setTextColor(...COR_TINTA);
    y += 6 * k;
  };

  /** Campos em células com borda: rótulo pequeno em caixa-alta e valor embaixo. */
  const tabela = (itens: [string, string][], colunas: 2 | 4 = 2) => {
    const w = LARG_UTIL / colunas;
    for (let i = 0; i < itens.length; i += colunas) {
      const linha = itens.slice(i, i + colunas);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(tamanhoCampo);
      const partes = linha.map(([, valor]) => quebrar(valor || '—', w - 4));
      const h = 4.6 * k + Math.max(...partes.map((p) => p.length)) * passo + 1.2 * k;
      garantir(h);
      linha.forEach(([rotulo], c) => {
        const x = MARGEM + c * w;
        caixa(x, y, w, h);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.8 * k);
        pdf.setTextColor(...COR_CINZA);
        pdf.text(rotulo.toUpperCase(), x + 2, y + 3.4 * k);
        pdf.setFontSize(tamanhoCampo);
        pdf.setTextColor(...COR_TINTA);
        pdf.text(partes[c], x + 2, y + 4.6 * k + passo);
      });
      y += h;
    }
    y += 2 * k;
  };

  /** Texto longo dentro de uma caixa, com o rótulo no alto. */
  const bloco = (rotulo: string, conteudo: string) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(tamanhoCampo);
    const partes = quebrar(conteudo, LARG_UTIL - 6);
    const h = 4.6 * k + partes.length * passo + 1.6 * k;
    garantir(h);
    caixa(MARGEM, y, LARG_UTIL, h);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8 * k);
    pdf.setTextColor(...COR_CINZA);
    pdf.text(rotulo.toUpperCase(), MARGEM + 2, y + 3.4 * k);
    pdf.setFontSize(tamanhoCampo);
    pdf.setTextColor(...COR_TINTA);
    pdf.text(partes, MARGEM + 3, y + 4.6 * k + passo);
    y += h;
    y += 2 * k;
  };

  /**
   * Área de assinatura digital: os documentos são baixados em PDF e assinados digitalmente,
   * então a caixa fica vazia para o certificado, com nome e descrição do signatário abaixo.
   */
  const assinaturas = (blocos: { nome: string; descricao: string }[]) => {
    const altura = 26 * k;
    garantir(altura + 6 * k);
    y += 4 * k;
    const w = LARG_UTIL / blocos.length;
    blocos.forEach((b, i) => {
      const x = MARGEM + i * w;
      caixa(x, y, w, altura);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8 * k);
      pdf.setTextColor(...COR_CINZA);
      pdf.text('ASSINATURA DIGITAL', x + 2, y + 3.4 * k);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8 * k);
      pdf.setTextColor(...COR_TINTA);
      pdf.text(b.nome, x + w / 2, y + altura - 5.5 * k, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8 * k);
      pdf.setTextColor(...COR_CINZA);
      pdf.text(quebrar(b.descricao, w - 6)[0] ?? '', x + w / 2, y + altura - 2 * k, { align: 'center' });
    });
    y += altura + 4 * k;
  };

  /** Opções marcáveis com quadradinho: a escolhida leva um X, como nos formulários. */
  const opcoesMarcaveis = (titulo: string, opcoes: readonly string[], escolhida: string) => {
    const passoOpcao = 4.8 * k;
    const quadro = 3 * k;
    const h = 4.6 * k + opcoes.length * passoOpcao + 1.6 * k;
    garantir(h);
    caixa(MARGEM, y, LARG_UTIL, h);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8 * k);
    pdf.setTextColor(...COR_CINZA);
    pdf.text(titulo.toUpperCase(), MARGEM + 2, y + 3.4 * k);
    opcoes.forEach((opcao, i) => {
      const yo = y + 4.6 * k + i * passoOpcao;
      const x = MARGEM + 3;
      const marcada = opcao === escolhida;
      pdf.setDrawColor(...COR_TINTA).setLineWidth(0.25).rect(x, yo, quadro, quadro);
      if (marcada) {
        pdf.setLineWidth(0.4);
        pdf.line(x + 0.5, yo + 0.5, x + quadro - 0.5, yo + quadro - 0.5);
        pdf.line(x + quadro - 0.5, yo + 0.5, x + 0.5, yo + quadro - 0.5);
      }
      pdf.setFont('helvetica', marcada ? 'bold' : 'normal');
      pdf.setFontSize(tamanhoCampo);
      pdf.setTextColor(...COR_TINTA);
      pdf.text(opcao, x + quadro + 2, yo + quadro - 0.4 * k);
    });
    y += h + 2 * k;
  };

  /** Termo de compromisso: registro completo da empresa, compromisso e assinatura do representante legal. */
  const corpoTermo = () => {
    const reg = autuado as unknown as RegistroDoCadastro;
    secao('Identificação da empresa');
    tabela(pairsDoCadastro(autuado));
    secao('Inscrição no CADEX');
    tabela([
      ['Situação', texto(reg.situacao_cadastro)],
      ['Processo', texto(reg.processo_numero)],
      ['Data do requerimento', data(reg.data_requerimento)],
      ['Portaria', texto(reg.portaria_numero)],
      ['Publicada em', data(reg.portaria_data)],
      ['Inscrição válida até', data(reg.validade_ate)],
    ]);
    secao('Compromisso');
    bloco('Compromisso assumido', TEXTO_TERMO_COMPROMISSO.compromisso.join('\n\n'));
    secao('Responsabilidade pelas informações');
    bloco('Responsabilidade', TEXTO_TERMO_COMPROMISSO.responsabilidade.join('\n\n'));
    garantir(8 * k);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(tamanhoCampo);
    pdf.setTextColor(...COR_TINTA);
    pdf.text(`${texto(dados.local)}, ${data(dados.data)}.`, MARGEM, y + 4 * k);
    y += 8 * k;
    assinaturas([{ nome: texto(reg.representante), descricao: 'Representante legal da empresa' }]);
  };

  /** Certidão de regularidade: empresa, responsável técnico, texto gerado do cadastro e assinatura do fiscal. */
  const corpoCertidao = () => {
    const reg = autuado as unknown as RegistroDoCadastro;
    secao('Identificação da empresa');
    tabela(pairsDoCadastro(autuado));
    secao('Responsável técnico');
    const rts = Array.isArray(reg.responsaveis) ? reg.responsaveis : [];
    bloco('Responsável técnico', rts.length === 0
      ? 'Nenhum responsável técnico ativo cadastrado na data de emissão.'
      : rts.map((rt) => textoResponsavel(rt)).join('\n\n'));
    secao('Certidão');
    bloco('Certifica-se que', textoCertidaoRegularidade(reg, doc.emitido_em).join('\n\n'));
    assinaturas([{
      nome: texto(dados.fiscal_nome),
      descricao: `Fiscal responsável pela emissão · Matrícula ${texto(dados.fiscal_matricula)}`,
    }]);
  };

  /** Autos (notificação, infração, embargo, apreensão): identificação, fato, conteúdo e recebimento. */
  const corpoAuto = () => {
    secao('Identificação do autuado');
    tabela([
      ['Razão social', texto(autuado.razao_social)],
      ['Nome fantasia', texto(autuado.nome_fantasia)],
      ['CPF/CNPJ', texto(autuado.cnpj)],
      ['Endereço', texto(autuado.endereco)],
      ['Cidade / UF', `${texto(autuado.cidade)} / ${texto(autuado.uf)}`],
      ['CEP', texto(autuado.cep)],
      ['Telefone', texto(autuado.telefone)],
    ]);

    secao('Fato constatado');
    const fato: [string, string][] = [
      ['Local da infração', texto(dados.local_infracao)],
      ['Data e hora', `${dados.data ? dataExibicao(String(dados.data)) : '—'} às ${texto(dados.hora)}`],
      ['Processo', texto(dados.processo)],
    ];
    if (dados.licenca) fato.push(['Licença nº', String(dados.licenca)]);
    if (dados.termo_permissao) fato.push(['Termo de permissão', String(dados.termo_permissao)]);
    tabela(fato);

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
    tabela(pares);
    for (const t of textos) bloco(t.rotulo, t.valor);

    secao('Defesa ou recurso');
    bloco('Prazo e destino', TEXTO_DEFESA_AUTO);

    secao('Recebimento');
    opcoesMarcaveis('Forma de recebimento', RECEBIMENTO, texto(dados.recebimento));

    assinaturas([
      { nome: texto(dados.fiscal_nome), descricao: `Fiscal autuante · Matrícula ${texto(dados.fiscal_matricula)}` },
    ]);
  };

  // Cabeçalho oficial: brasão centralizado, órgão em caixa-alta e a faixa com o tipo do documento.
  const ALTURA_BRASAO = 22 * k;
  if (logo) {
    const { width, height } = pdf.getImageProperties(logo);
    const largura = ALTURA_BRASAO * (width / height);
    pdf.addImage(logo, 'PNG', (LARGURA - largura) / 2, y, largura, ALTURA_BRASAO);
  }
  y += ALTURA_BRASAO + 2 * k;
  const orgao: [string, number, [number, number, number], 'normal' | 'bold'][] = [
    ['PREFEITURA MUNICIPAL DE NITERÓI', 9.5, COR_TINTA, 'bold'],
    ['SECRETARIA DE CONSERVAÇÃO E SERVIÇOS PÚBLICOS', 7.5, COR_CINZA, 'normal'],
    ['FISCALIZAÇÃO DE SERVIÇOS CONCEDIDOS', 7.5, COR_MARCA, 'bold'],
  ];
  for (const [t, tamanho, cor, estilo] of orgao) {
    pdf.setFont('helvetica', estilo);
    pdf.setFontSize(tamanho * k);
    pdf.setTextColor(...cor);
    pdf.text(t, LARGURA / 2, y + 3.5 * k, { align: 'center' });
    y += 4.2 * k;
  }
  y += 3 * k;
  pdf.setTextColor(...COR_TINTA);

  const titulo = TITULO_DOCUMENTO[doc.tipo].toUpperCase();
  faixa(titulo);
  if (doc.tipo === 'certidao_regularidade' || doc.tipo === 'termo_compromisso') {
    tabela([
      ['Número', numeroDocumento(doc.numero, doc.tipo, doc.emitido_em)],
      ['Emitida em', instanteExibicao(doc.emitido_em)],
      ['Válida até', dataExibicao(validadeDocumento(doc.emitido_em))],
      ['Código de controle', codigoLegivel(doc.codigo_verificacao)],
    ], 4);
  } else {
    tabela([
      ['Auto nº', numeroDocumento(doc.numero, doc.tipo, doc.emitido_em)],
      ['Data', data(dados.data)],
      ['Hora', texto(dados.hora)],
      ['Processo', texto(dados.processo)],
    ], 4);
  }
  y += 2 * k;

  if (doc.tipo === 'termo_compromisso') corpoTermo();
  else if (doc.tipo === 'certidao_regularidade') corpoCertidao();
  else corpoAuto();

  // Tarja e QR Code de verificação, sempre na mesma folha, acima do rodapé.
  const compacto = doc.codigo_verificacao.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  pdf.setFillColor(238, 246, 246);
  pdf.rect(MARGEM, BLOCO_Y, LARG_UTIL, 5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COR_MARCA);
  pdf.text(quebrar(tarjaDoDocumento(doc), LARG_UTIL - 4)[0], MARGEM + 2, BLOCO_Y + 3.4);
  const qr = await QRCode.toDataURL(`${origem}/documento/${compacto}`, { margin: 0, errorCorrectionLevel: 'M', width: 240 });
  caixa(MARGEM, BLOCO_Y + 6, 19, 19);
  pdf.addImage(qr, 'PNG', MARGEM + 2, BLOCO_Y + 8, 15, 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COR_CINZA);
  pdf.text('Verifique a autenticidade e a situação atual em:', MARGEM + 22, BLOCO_Y + 9.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COR_TINTA);
  pdf.text(`${origem.replace(/^https?:\/\//, '')}/documento/${codigoLegivel(doc.codigo_verificacao)}`, MARGEM + 22, BLOCO_Y + 13.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COR_CINZA);
  pdf.text('Ou aponte a câmera para o QR Code.', MARGEM + 22, BLOCO_Y + 17.5);

  // Rodapé: código de verificação e data de emissão.
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COR_CINZA);
  pdf.text(
    `Código de verificação: ${codigoLegivel(doc.codigo_verificacao)} · Emitido em ${instanteExibicao(doc.emitido_em)} · Página 1 de 1`,
    LARGURA / 2, 293, { align: 'center' },
  );

  if (pdf.getNumberOfPages() !== 1) throw new ErroNaoCabe();
  return pdf.output('arraybuffer');
}
