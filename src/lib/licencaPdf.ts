import { dataExibicao, instanteExibicao } from './documentos';
import { ESCALAS_FOLHA, ErroNaoCabe, Folha, cabecalhoOficial, emFolhaUnica, rodape, verificacao } from './pdfFolha';

/**
 * Licença para execução de obras e serviços em vias públicas. Gerada a partir do registro
 * da licença no CADEX. A numeração é da SECONSER e vem digitada no registro; o PDF só a mostra.
 * O PDF vai para o SEI, onde a Secretária assina digitalmente.
 */

export const TITULO_LICENCA = 'Licença para execução de obras e serviços em vias públicas';

/** Pessoa ou órgão que aparece na licença (executora, subcontratada, contratante). */
export interface PartePdf {
  nome: string;
  cnpj: string | null;
  /** Código CADEX da empresa; nulo para órgão público ou empresa sem cadastro. */
  codigo_cadex: string | null;
  contato: string | null;
  endereco: string | null;
}

export interface ResponsavelPdf {
  nome: string;
  conselho: string;
  registro_numero: string;
  registro_uf: string | null;
  art_rrt_numero: string | null;
}

export interface TrechoPdf {
  logradouro: string;
  bairro: string | null;
  referencia: string | null;
  inicio: string;
  fim: string | null;
}

export interface DadosLicencaPdf {
  numero: string;
  processo_sei: string;
  /** Instante de emissão, em ISO. */
  emitida_em: string;
  inicio_previsto: string;
  fim_previsto: string | null;
  /** Data ISO até a qual a licença vale. Hoje, 30 dias a partir do início. */
  validade_ate: string;
  /** Todos os tipos do catálogo do setor, pelo rótulo, na ordem do catálogo. */
  tipos: string[];
  /** Rótulos dos tipos escolhidos nesta licença. */
  escolhidos: string[];
  outros_descricao: string | null;
  escopo: string;
  trechos: TrechoPdf[];
  executora: PartePdf;
  subcontratada: PartePdf | null;
  contratante: PartePdf | null;
  responsavel_tecnico: ResponsavelPdf | null;
  fiscal: { nome: string; matricula: string };
  secretaria: { nome: string };
  /** Código público do QR Code da placa (art. 14 da Resolução). */
  codigo_publico: string;
}

/** Condições fixas. Cada uma cita a norma de onde vem. Texto a conferir antes de publicar. */
export const CONDICOES_LICENCA: readonly string[] = [
  'Autoriza apenas os trechos e o período indicados. Outra execução depende de nova licença, por trecho (Resolução Conjunta SECONSER/SEOP nº 001/2026, art. 11).',
  'Sinalização conforme os padrões da SECONSER, com segurança de pedestres, ciclistas e veículos e mínima interferência no trânsito (Lei nº 3.988/2025, art. 6º, IV a VI).',
  'Concluída a intervenção, a via é recomposta e os danos reparados, e o As Built é protocolado na SECONSER (Lei nº 3.988/2025, art. 6º, VII e IX; Resolução, art. 26).',
  'O canteiro mantém a placa ou o QR Code desta licença, com a razão social da executora, o número, o escopo e o prazo (Resolução, art. 14).',
  'A comunidade afetada é informada antes do início sobre a duração e os impactos (Lei nº 3.988/2025, art. 6º, XIV).',
  'A intervenção se conclui no período desta licença. A prorrogação é pedida pela empresa, dentro dos 30 dias do início.',
  'Esta licença não dispensa as demais autorizações (Lei nº 3.988/2025, art. 10). Danos ao patrimônio são responsabilidade da executora (art. 6º, XV).',
];

const texto = (valor: string | null | undefined) => (valor && valor.trim() ? valor : '—');

function textoParte(p: PartePdf): string {
  return `${p.nome}${p.cnpj ? ` · CNPJ ${p.cnpj}` : ''}`;
}

function textoResponsavel(rt: ResponsavelPdf): string {
  const registro = `${rt.conselho} ${rt.registro_numero}${rt.registro_uf ? ` / ${rt.registro_uf.trim()}` : ''}`;
  return `${rt.nome} · ${registro}${rt.art_rrt_numero ? ` · ART/RRT ${rt.art_rrt_numero}` : ''}`;
}

/** Confere o que a licença exige antes de desenhar: número, validade e um trecho. */
export function problemasParaLicenca(dados: DadosLicencaPdf): string[] {
  const problemas: string[] = [];
  if (!dados.numero.trim()) problemas.push('Informe o número da licença.');
  if (!dados.inicio_previsto) problemas.push('Informe a data de início da obra ou serviço.');
  if (dados.trechos.length === 0) problemas.push('A licença precisa de pelo menos um trecho.');
  if (dados.escolhidos.length === 0) problemas.push('Marque pelo menos um tipo de intervenção.');
  return problemas;
}

/**
 * Gera a licença numa única folha A4. Tenta a escala normal e reduz até caber; se nem
 * na menor escala couber, falha. Quem chama deve checar `problemasParaLicenca` antes.
 */
/**
 * `previa` gera a versão de conferência, com marca d'água "PRÉVIA · NÃO EMITIDA". Nada é
 * gravado; o PDF oficial sai sem a marca.
 */
export async function gerarPdfLicenca(
  dados: DadosLicencaPdf,
  logo?: string,
  origem: string = typeof window !== 'undefined' ? window.location.origin : '',
  previa = false,
): Promise<ArrayBuffer> {
  return emFolhaUnica(
    ESCALAS_FOLHA,
    (k) => montarLicenca(dados, logo, origem, k, previa),
    'A licença não cabe em uma folha A4 mesmo na menor escala. Reduza o número de trechos ou avise o suporte.',
  );
}

async function montarLicenca(
  dados: DadosLicencaPdf, logo: string | undefined, origem: string, k: number, previa: boolean,
): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf');
  const QRCode = (await import('qrcode')).default;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const f = new Folha(pdf, k);

  cabecalhoOficial(f, logo);
  f.faixa(TITULO_LICENCA.toUpperCase());
  f.tabela([
    ['Licença nº', dados.numero],
    ['Processo SEI', texto(dados.processo_sei)],
    ['Emitida em', instanteExibicao(dados.emitida_em)],
    ['Válida até', dataExibicao(dados.validade_ate)],
    ['Início previsto', dataExibicao(dados.inicio_previsto)],
    ['Término previsto', dados.fim_previsto ? dataExibicao(dados.fim_previsto) : '—'],
    ['Prazo', '30 dias do início, prorrogável'],
    ['Trechos', `${dados.trechos.length} ${dados.trechos.length === 1 ? 'trecho' : 'trechos'}`],
  ], 4);
  f.y += 2 * k;

  f.secao('Executora e responsáveis');
  f.tabela([
    ['Executora', textoParte(dados.executora)],
    ['Subcontratada', dados.subcontratada ? textoParte(dados.subcontratada) : '—'],
    ['Contratante', dados.contratante ? textoParte(dados.contratante) : '—'],
    ['Responsável técnico', dados.responsavel_tecnico ? textoResponsavel(dados.responsavel_tecnico) : '—'],
    ['Código CADEX', texto(dados.executora.codigo_cadex)],
    ['Contato', texto(dados.executora.contato)],
    ['Endereço', texto(dados.executora.endereco)],
  ], 4);

  f.secao('Objeto da intervenção');
  f.marcaveis('Tipos de intervenção (art. 10 da Resolução)', dados.tipos, dados.escolhidos, 3);
  if (dados.outros_descricao) f.bloco('Descrição de outros tipos', dados.outros_descricao, 0.9);
  f.bloco('Descrição da obra ou serviço', texto(dados.escopo), 0.9);

  f.secao('Trechos autorizados');
  f.grade(
    ['Nº', 'Logradouro e bairro', 'Referência', 'Início (lat, long)', 'Fim (lat, long)'],
    dados.trechos.map((t, i) => [
      String(i + 1),
      [t.logradouro, t.bairro].filter(Boolean).join(' · '),
      t.referencia ?? '—',
      t.inicio,
      t.fim ?? '—',
    ]),
    [5, 32, 23, 20, 20],
  );

  f.secao('Condições de execução');
  f.bloco('Condições', CONDICOES_LICENCA.map((c, i) => `${i + 1}. ${c}`).join('\n'), 0.85);

  f.secao('Assinaturas');
  f.assinaturas([
    { nome: dados.fiscal.nome, descricao: `Fiscal emissor · Matrícula ${dados.fiscal.matricula}` },
    { nome: dados.secretaria.nome, descricao: 'Secretária de Conservação e Serviços Públicos' },
  ]);

  const endereco = `${origem.replace(/^https?:\/\//, '')}/licenca/${dados.codigo_publico}`;
  const qr = await QRCode.toDataURL(`${origem}/licenca/${dados.codigo_publico}`, { margin: 0, errorCorrectionLevel: 'M', width: 240 });
  if (previa) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(44);
    pdf.setTextColor(220, 224, 227);
    pdf.text('PRÉVIA · NÃO EMITIDA', 105, 175, { align: 'center', angle: 45 });
  }
  verificacao(f, {
    tarja: `Licença válida até ${dataExibicao(dados.validade_ate)}. Confira a situação atual no QR Code.`,
    qr,
    endereco,
  });
  rodape(pdf, `Licença nº ${dados.numero} · Emitida em ${instanteExibicao(dados.emitida_em)} · Página 1 de 1`);

  if (pdf.getNumberOfPages() !== 1) throw new ErroNaoCabe();
  return pdf.output('arraybuffer');
}
