import type { DocumentoOficial, RegistroDoCadastro, ResponsavelDoCadastro, TipoDocumento } from './documentos';
import {
  CAMPOS_DOCUMENTO, RECEBIMENTO, TEXTO_DEFESA_AUTO, TEXTO_TERMO_COMPROMISSO, TITULO_DOCUMENTO, codigoLegivel, dataExibicao,
  instanteExibicao, numeroDocumento, textoCertidaoRegularidade, validadeDocumento,
} from './documentos';
import {
  COR_TINTA, ESCALAS_FOLHA, ErroNaoCabe, Folha, MARGEM, cabecalhoOficial, emFolhaUnica, rodape, verificacao,
} from './pdfFolha';

/**
 * PDF de um documento já emitido. Lê só o registro guardado: se o cadastro
 * da empresa mudar depois, o documento continua como foi emitido.
 *
 * Todo documento é uma única folha A4 (ver pdfFolha.ts).
 */

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

/** Linha do fiscal sob a assinatura: função, cargo e matrícula. Documentos antigos não têm cargo. */
function descricaoFiscal(dados: Dados, funcao: string): string {
  const cargo = typeof dados.fiscal_cargo === 'string' && dados.fiscal_cargo.trim() ? ` · ${dados.fiscal_cargo.trim()}` : '';
  return `${funcao}${cargo} · Matrícula ${texto(dados.fiscal_matricula)}`;
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
  return emFolhaUnica(
    ESCALAS_FOLHA,
    (k) => montarPdf(doc, logo, origem, k),
    'O documento não cabe em uma folha A4 mesmo na menor escala. Avise o suporte.',
  );
}

async function montarPdf(doc: DocumentoOficial, logo: string | undefined, origem: string, k: number): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf');
  const QRCode = (await import('qrcode')).default;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const f = new Folha(pdf, k);
  const dados = doc.dados as Dados;
  const autuado = (dados.autuado ?? {}) as Dados;
  const data = (v: unknown) => (v ? dataExibicao(String(v)) : '—');

  /** Termo de compromisso: registro completo da empresa, compromisso e assinatura do representante legal. */
  const corpoTermo = () => {
    const reg = autuado as unknown as RegistroDoCadastro;
    f.secao('Identificação da empresa');
    f.tabela(pairsDoCadastro(autuado));
    f.secao('Inscrição no CADEX');
    f.tabela([
      ['Situação', texto(reg.situacao_cadastro)],
      ['Processo', texto(reg.processo_numero)],
      ['Data do requerimento', data(reg.data_requerimento)],
      ['Portaria', texto(reg.portaria_numero)],
      ['Publicada em', data(reg.portaria_data)],
      ['Inscrição válida até', data(reg.validade_ate)],
    ]);
    f.secao('Compromisso');
    f.bloco('Compromisso assumido', TEXTO_TERMO_COMPROMISSO.compromisso.join('\n\n'));
    f.secao('Responsabilidade pelas informações');
    f.bloco('Responsabilidade', TEXTO_TERMO_COMPROMISSO.responsabilidade.join('\n\n'));
    f.garantir(8 * k);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(f.tamanhoCampo);
    pdf.setTextColor(...COR_TINTA);
    pdf.text(`${texto(dados.local)}, ${data(dados.data)}.`, MARGEM, f.y + 4 * k);
    f.y += 8 * k;
    f.assinaturas([{ nome: texto(reg.representante), descricao: 'Representante legal da empresa' }]);
  };

  /** Certidão de regularidade: empresa, responsável técnico, texto gerado do cadastro e assinatura do fiscal. */
  const corpoCertidao = () => {
    const reg = autuado as unknown as RegistroDoCadastro;
    f.secao('Identificação da empresa');
    f.tabela(pairsDoCadastro(autuado));
    f.secao('Responsável técnico');
    const rts = Array.isArray(reg.responsaveis) ? reg.responsaveis : [];
    f.bloco('Responsável técnico', rts.length === 0
      ? 'Nenhum responsável técnico ativo cadastrado na data de emissão.'
      : rts.map((rt) => textoResponsavel(rt)).join('\n\n'));
    f.secao('Certidão');
    f.bloco('Certifica-se que', textoCertidaoRegularidade(reg, doc.emitido_em).join('\n\n'));
    f.assinaturas([{ nome: texto(dados.fiscal_nome), descricao: descricaoFiscal(dados, 'Fiscal responsável pela emissão') }]);
  };

  /** Autos (notificação, infração, embargo, apreensão): identificação, fato, conteúdo, defesa e recebimento. */
  const corpoAuto = () => {
    f.secao('Identificação do autuado');
    f.tabela([
      ['Razão social', texto(autuado.razao_social)],
      ['Nome fantasia', texto(autuado.nome_fantasia)],
      ['CPF/CNPJ', texto(autuado.cnpj)],
      ['Endereço', texto(autuado.endereco)],
      ['Cidade / UF', `${texto(autuado.cidade)} / ${texto(autuado.uf)}`],
      ['CEP', texto(autuado.cep)],
      ['Telefone', texto(autuado.telefone)],
    ]);

    f.secao('Fato constatado');
    const fato: [string, string][] = [
      ['Local da infração', texto(dados.local_infracao)],
      ['Data e hora', `${dados.data ? dataExibicao(String(dados.data)) : '—'} às ${texto(dados.hora)}`],
      ['Processo', texto(dados.processo)],
    ];
    if (dados.licenca) fato.push(['Licença nº', String(dados.licenca)]);
    if (dados.termo_permissao) fato.push(['Termo de permissão', String(dados.termo_permissao)]);
    f.tabela(fato);

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
    if (pares.length > 0 || textos.length > 0) f.secao('Conteúdo');
    f.tabela(pares);
    for (const t of textos) f.bloco(t.rotulo, t.valor);

    f.secao('Defesa ou recurso');
    f.bloco('Prazo e destino', TEXTO_DEFESA_AUTO);

    f.secao('Recebimento');
    f.marcaveis('Forma de recebimento', RECEBIMENTO, [texto(dados.recebimento)], 1);

    f.assinaturas([{ nome: texto(dados.fiscal_nome), descricao: descricaoFiscal(dados, 'Fiscal autuante') }]);
  };

  cabecalhoOficial(f, logo);
  f.faixa(TITULO_DOCUMENTO[doc.tipo].toUpperCase());
  if (doc.tipo === 'certidao_regularidade' || doc.tipo === 'termo_compromisso') {
    f.tabela([
      ['Número', numeroDocumento(doc.numero, doc.tipo, doc.emitido_em)],
      ['Emitida em', instanteExibicao(doc.emitido_em)],
      ['Válida até', dataExibicao(validadeDocumento(doc.emitido_em))],
      ['Código de controle', codigoLegivel(doc.codigo_verificacao)],
    ], 4);
  } else {
    f.tabela([
      ['Auto nº', numeroDocumento(doc.numero, doc.tipo, doc.emitido_em)],
      ['Data', data(dados.data)],
      ['Hora', texto(dados.hora)],
      ['Processo', texto(dados.processo)],
    ], 4);
  }
  f.y += 2 * k;

  if (doc.tipo === 'termo_compromisso') corpoTermo();
  else if (doc.tipo === 'certidao_regularidade') corpoCertidao();
  else corpoAuto();

  const compacto = doc.codigo_verificacao.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const qr = await QRCode.toDataURL(`${origem}/documento/${compacto}`, { margin: 0, errorCorrectionLevel: 'M', width: 240 });
  verificacao(f, {
    tarja: tarjaDoDocumento(doc),
    qr,
    endereco: `${origem.replace(/^https?:\/\//, '')}/documento/${codigoLegivel(doc.codigo_verificacao)}`,
  });
  rodape(pdf, `Código de verificação: ${codigoLegivel(doc.codigo_verificacao)} · Emitido em ${instanteExibicao(doc.emitido_em)} · Página 1 de 1`);

  if (pdf.getNumberOfPages() !== 1) throw new ErroNaoCabe();
  return pdf.output('arraybuffer');
}
