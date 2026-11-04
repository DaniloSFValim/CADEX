import type { jsPDF } from 'jspdf';

/**
 * Primitivas de layout dos documentos oficiais do CADEX: autos, termo, certidão e
 * licença de obra. Todos usam as mesmas medidas, cores, cabeçalho, seções, assinatura
 * e verificação, para que qualquer um reconheça que são da mesma secretaria.
 *
 * Cada documento é uma única folha A4. A escala (k) reduz fontes e espaços quando
 * o conteúdo é longo; se nem na menor escala couber, lança ErroNaoCabe.
 */

export const MARGEM = 15;
export const LARGURA = 210;
export const LARG_UTIL = LARGURA - 2 * MARGEM;
/** Último ponto do corpo: acima da tarja de verificação (BLOCO_Y) e do rodapé. */
export const LIMITE_CORPO = 264;
export const BLOCO_Y = 269;
const RODAPE_Y = 293;

export type Cor = [number, number, number];
// Cores da identidade, as mesmas da ficha e dos relatórios (tailwind.config.js).
export const COR_MARCA: Cor = [11, 91, 104];
export const COR_TINTA: Cor = [20, 29, 38];
export const COR_CINZA: Cor = [86, 98, 110];
export const COR_FIO: Cor = [205, 212, 216];

/** Conteúdo que não cabe na escala atual. Quem chama tenta a escala seguinte. */
export class ErroNaoCabe extends Error {}

/** Folha A4 em desenho: guarda a posição vertical e a escala de todos os blocos. */
export class Folha {
  y = MARGEM;
  private secoes = 0;
  readonly tamanhoCampo: number;
  readonly passo: number;

  constructor(readonly pdf: jsPDF, readonly k: number) {
    this.tamanhoCampo = 9 * k;
    this.passo = 4 * k;
  }

  quebrar(t: string, largura: number): string[] {
    return this.pdf.splitTextToSize(t, largura) as string[];
  }

  garantir(altura: number) {
    if (this.y + altura > LIMITE_CORPO) throw new ErroNaoCabe();
  }

  /** Borda fina, como nos formulários e certidões impressas. */
  caixa(x: number, y: number, w: number, h: number) {
    this.pdf.setDrawColor(...COR_FIO).setLineWidth(0.3).rect(x, y, w, h);
  }

  /** Faixa de título: fundo azul-marca e texto em branco, como nas certidões on-line. */
  faixa(titulo: string) {
    const { pdf, k } = this;
    this.garantir(12 * k);
    pdf.setFillColor(...COR_MARCA);
    pdf.rect(MARGEM, this.y, LARG_UTIL, 9 * k, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11 * k);
    pdf.setTextColor(255, 255, 255);
    pdf.text(titulo, LARGURA / 2, this.y + 6 * k, { align: 'center' });
    pdf.setTextColor(...COR_TINTA);
    this.y += 11 * k;
  }

  /** Seção numerada, como nos atos da fiscalização. */
  secao(titulo: string) {
    const { pdf, k } = this;
    this.secoes += 1;
    this.garantir(12 * k);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5 * k);
    pdf.setTextColor(...COR_MARCA);
    pdf.text(`${this.secoes}. ${titulo.toUpperCase()}`, MARGEM, this.y + 4 * k);
    pdf.setTextColor(...COR_TINTA);
    this.y += 6 * k;
  }

  /** Campos em células com borda: rótulo pequeno em caixa-alta e valor embaixo. */
  tabela(itens: [string, string][], colunas: 2 | 4 = 2) {
    const { pdf, k, passo } = this;
    const w = LARG_UTIL / colunas;
    for (let i = 0; i < itens.length; i += colunas) {
      const linha = itens.slice(i, i + colunas);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(this.tamanhoCampo);
      const partes = linha.map(([, valor]) => this.quebrar(valor || '—', w - 4));
      const h = 4.6 * k + Math.max(...partes.map((p) => p.length)) * passo + 1.2 * k;
      this.garantir(h);
      linha.forEach(([rotulo], c) => {
        const x = MARGEM + c * w;
        this.caixa(x, this.y, w, h);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.8 * k);
        pdf.setTextColor(...COR_CINZA);
        pdf.text(rotulo.toUpperCase(), x + 2, this.y + 3.4 * k);
        pdf.setFontSize(this.tamanhoCampo);
        pdf.setTextColor(...COR_TINTA);
        pdf.text(partes[c], x + 2, this.y + 4.6 * k + passo);
      });
      this.y += h;
    }
    this.y += 2 * k;
  }

  /** Grade com cabeçalho e linhas, para listas como os trechos da obra. */
  grade(cabecalho: string[], linhas: string[][], proporcoes: number[]) {
    const { pdf, k } = this;
    const larguras = proporcoes.map((p) => (p / proporcoes.reduce((a, b) => a + b, 0)) * LARG_UTIL);
    const passoGrade = 3.6 * k;
    const xs = larguras.map((_, i) => MARGEM + larguras.slice(0, i).reduce((a, b) => a + b, 0));
    const desenhar = (celulas: string[], rotulo: boolean) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(rotulo ? 6.8 * k : this.tamanhoCampo - 0.5 * k);
      const partes = celulas.map((t, i) => this.quebrar(t || '—', larguras[i] - 3));
      const h = Math.max(...partes.map((p) => p.length)) * passoGrade + 2.6 * k;
      this.garantir(h);
      celulas.forEach((_, i) => {
        this.caixa(xs[i], this.y, larguras[i], h);
        pdf.setTextColor(...(rotulo ? COR_CINZA : COR_TINTA));
        pdf.text(partes[i], xs[i] + 1.5, this.y + 3 * k);
      });
      this.y += h;
    };
    desenhar(cabecalho, true);
    linhas.forEach((linha) => desenhar(linha, false));
    this.y += 2 * k;
  }

  /** Texto longo dentro de uma caixa, com o rótulo no alto. `escala` reduz a fonte e as linhas. */
  bloco(rotulo: string, conteudo: string, escala = 1) {
    const { pdf, k } = this;
    const tamanho = this.tamanhoCampo * escala;
    const passo = 4 * k * escala;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(tamanho);
    const partes = this.quebrar(conteudo, LARG_UTIL - 6);
    const h = 4.6 * k + partes.length * passo + 1.6 * k;
    this.garantir(h);
    this.caixa(MARGEM, this.y, LARG_UTIL, h);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8 * k);
    pdf.setTextColor(...COR_CINZA);
    pdf.text(rotulo.toUpperCase(), MARGEM + 2, this.y + 3.4 * k);
    pdf.setFontSize(tamanho);
    pdf.setTextColor(...COR_TINTA);
    pdf.text(partes, MARGEM + 3, this.y + 4.6 * k + passo);
    this.y += h + 2 * k;
  }

  /** Opções marcáveis com quadradinho: as escolhidas levam um X, como nos formulários. */
  marcaveis(titulo: string, opcoes: readonly string[], escolhidas: readonly string[], colunas: 1 | 2 | 3) {
    const { pdf, k } = this;
    const tamanho = colunas === 3 ? this.tamanhoCampo * 0.9 : this.tamanhoCampo;
    const linhas = Math.ceil(opcoes.length / colunas);
    const passoOpcao = 4.8 * k;
    const quadro = 3 * k;
    const h = 4.6 * k + linhas * passoOpcao + 1.6 * k;
    this.garantir(h);
    this.caixa(MARGEM, this.y, LARG_UTIL, h);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8 * k);
    pdf.setTextColor(...COR_CINZA);
    pdf.text(titulo.toUpperCase(), MARGEM + 2, this.y + 3.4 * k);
    const larg = LARG_UTIL / colunas;
    opcoes.forEach((opcao, i) => {
      const x = MARGEM + 3 + (i % colunas) * larg;
      const yo = this.y + 4.6 * k + Math.floor(i / colunas) * passoOpcao;
      const marcada = escolhidas.includes(opcao);
      pdf.setDrawColor(...COR_TINTA).setLineWidth(0.25).rect(x, yo, quadro, quadro);
      if (marcada) {
        pdf.setLineWidth(0.4);
        pdf.line(x + 0.5, yo + 0.5, x + quadro - 0.5, yo + quadro - 0.5);
        pdf.line(x + quadro - 0.5, yo + 0.5, x + 0.5, yo + quadro - 0.5);
      }
      pdf.setFont('helvetica', marcada ? 'bold' : 'normal');
      pdf.setFontSize(tamanho);
      pdf.setTextColor(...COR_TINTA);
      pdf.text(opcao, x + quadro + 2, yo + quadro - 0.4 * k);
    });
    this.y += h + 2 * k;
  }

  /**
   * Área de assinatura digital: os documentos são baixados em PDF e assinados digitalmente,
   * então a caixa fica vazia para o certificado, com nome e descrição do signatário abaixo.
   */
  assinaturas(blocos: { nome: string; descricao: string }[]) {
    const { pdf, k } = this;
    const altura = 26 * k;
    this.garantir(altura + 6 * k);
    this.y += 4 * k;
    const w = LARG_UTIL / blocos.length;
    blocos.forEach((b, i) => {
      const x = MARGEM + i * w;
      this.caixa(x, this.y, w, altura);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8 * k);
      pdf.setTextColor(...COR_CINZA);
      pdf.text('ASSINATURA DIGITAL', x + 2, this.y + 3.4 * k);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8 * k);
      pdf.setTextColor(...COR_TINTA);
      pdf.text(b.nome, x + w / 2, this.y + altura - 5.5 * k, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8 * k);
      pdf.setTextColor(...COR_CINZA);
      pdf.text(this.quebrar(b.descricao, w - 6)[0] ?? '', x + w / 2, this.y + altura - 2 * k, { align: 'center' });
    });
    this.y += altura + 4 * k;
  }
}

/** Cabeçalho oficial: brasão centralizado e o órgão em caixa-alta. */
export function cabecalhoOficial(f: Folha, logo?: string) {
  const { pdf, k } = f;
  const altura = 22 * k;
  if (logo) {
    const { width, height } = pdf.getImageProperties(logo);
    const largura = altura * (width / height);
    pdf.addImage(logo, 'PNG', (LARGURA - largura) / 2, f.y, largura, altura);
  }
  f.y += altura + 2 * k;
  const orgao: [string, number, Cor, 'normal' | 'bold'][] = [
    ['PREFEITURA MUNICIPAL DE NITERÓI', 9.5, COR_TINTA, 'bold'],
    ['SECRETARIA DE CONSERVAÇÃO E SERVIÇOS PÚBLICOS', 7.5, COR_CINZA, 'normal'],
    ['FISCALIZAÇÃO DE SERVIÇOS CONCEDIDOS', 7.5, COR_MARCA, 'bold'],
  ];
  for (const [t, tamanho, cor, estilo] of orgao) {
    pdf.setFont('helvetica', estilo);
    pdf.setFontSize(tamanho * k);
    pdf.setTextColor(...cor);
    pdf.text(t, LARGURA / 2, f.y + 3.5 * k, { align: 'center' });
    f.y += 4.2 * k;
  }
  f.y += 3 * k;
  pdf.setTextColor(...COR_TINTA);
}

/** Tarja e QR Code de verificação, sempre no fim da folha, acima do rodapé. */
export function verificacao(f: Folha, opcoes: { tarja: string; qr: string; endereco: string }) {
  const { pdf } = f;
  pdf.setFillColor(238, 246, 246);
  pdf.rect(MARGEM, BLOCO_Y, LARG_UTIL, 5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COR_MARCA);
  pdf.text(f.quebrar(opcoes.tarja, LARG_UTIL - 4)[0], MARGEM + 2, BLOCO_Y + 3.4);
  f.caixa(MARGEM, BLOCO_Y + 6, 19, 19);
  pdf.addImage(opcoes.qr, 'PNG', MARGEM + 2, BLOCO_Y + 8, 15, 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COR_CINZA);
  pdf.text('Verifique a autenticidade e a situação atual em:', MARGEM + 22, BLOCO_Y + 9.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COR_TINTA);
  pdf.text(opcoes.endereco, MARGEM + 22, BLOCO_Y + 13.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COR_CINZA);
  pdf.text('Ou aponte a câmera para o QR Code.', MARGEM + 22, BLOCO_Y + 17.5);
}

/** Linhas de rodapé, centralizadas: uma por item, de cima para baixo, acima da margem. */
export function rodape(pdf: jsPDF, linhas: string | string[]) {
  const lista = typeof linhas === 'string' ? [linhas] : linhas;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...COR_CINZA);
  lista.forEach((texto, i) => {
    pdf.text(texto, LARGURA / 2, RODAPE_Y - 3.5 * (lista.length - 1 - i), { align: 'center' });
  });
}

/**
 * Roda a montagem em escalas decrescentes até caber numa folha. Se nenhuma escala couber,
 * falha em vez de emitir um documento com mais de uma folha.
 */
export async function emFolhaUnica<T>(
  escalas: readonly number[],
  montar: (k: number) => Promise<T>,
  mensagemFalha: string,
): Promise<T> {
  for (const k of escalas) {
    try {
      return await montar(k);
    } catch (erro) {
      if (!(erro instanceof ErroNaoCabe)) throw erro;
    }
  }
  throw new Error(mensagemFalha);
}

/** Escalas tentadas em ordem: a primeira em que tudo cabe numa folha vence. */
export const ESCALAS_FOLHA = [1, 0.95, 0.9, 0.85, 0.8, 0.75] as const;
