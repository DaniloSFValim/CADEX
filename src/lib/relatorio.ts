import { baixarArquivo, gerarCsv } from './exportar';

/**
 * Relatório exportável: o mesmo conteúdo sai em PDF (para anexar ao SEI)
 * ou em planilha (.csv que abre no Excel).
 */
export interface Relatorio {
  titulo: string;
  /** Linhas de contexto: filtros aplicados, agrupamento. */
  filtros: string[];
  colunas: string[];
  grupos: GrupoRelatorio[];
  /** Nome do arquivo, sem extensão. */
  arquivo: string;
}

export interface GrupoRelatorio {
  /** Vazio quando não há agrupamento. */
  titulo: string;
  linhas: string[][];
}

/**
 * Agrupa itens pela chave (um item pode cair em mais de um grupo, ex.:
 * terceirizada com dois contratantes). Grupos em ordem alfabética, com os
 * de rótulo "sem ..." por último; itens mantêm a ordem recebida.
 */
export function agrupar<T>(itens: T[], chaves: (item: T) => string[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    for (const k of chaves(item)) mapa.set(k, [...(mapa.get(k) ?? []), item]);
  }
  const semGrupo = (k: string) => (/^(sem|nenhum)/i.test(k) ? 1 : 0);
  return new Map([...mapa.entries()].sort(([a], [b]) => semGrupo(a) - semGrupo(b) || a.localeCompare(b, 'pt-BR')));
}

export const totalLinhas = (r: Relatorio) => r.grupos.reduce((s, g) => s + g.linhas.length, 0);

/** Planilha: com agrupamento, o grupo vira a primeira coluna. */
export function relatorioCsv(r: Relatorio): string {
  const agrupado = r.grupos.some((g) => g.titulo);
  return gerarCsv(
    agrupado ? ['Grupo', ...r.colunas] : r.colunas,
    r.grupos.flatMap((g) => g.linhas.map((l) => (agrupado ? [g.titulo, ...l] : l))),
  );
}

const dataHora = (d: Date) =>
  `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

const sufixoData = (d: Date) => d.toISOString().slice(0, 10);

export function baixarCsv(r: Relatorio, agora = new Date()) {
  baixarArquivo(`${r.arquivo}-${sufixoData(agora)}.csv`, relatorioCsv(r));
}

// Cores da identidade (tailwind.config.js).
const COR = {
  marca: [11, 91, 104] as [number, number, number],   // marca-700
  tinta: [20, 29, 38] as [number, number, number],      // tinta-900
  cinza: [86, 98, 110] as [number, number, number],     // tinta-500
  fio: [205, 212, 216] as [number, number, number],     // tinta-200
  grupo: [238, 246, 246] as [number, number, number],   // marca-50
};

/**
 * PDF em A4 (paisagem a partir de 7 colunas): cabeçalho institucional,
 * filtros, tabela com os grupos, total e "Página X de Y". A biblioteca só
 * é carregada aqui, na hora de exportar.
 */
export async function gerarPdf(r: Relatorio, emitidoPor: string, agora = new Date()): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const paisagem = r.colunas.length >= 7;
  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();
  const margem = 14;

  doc.setProperties({ title: r.titulo, subject: 'CADEX', creator: 'CADEX - SECONSER Niterói' });

  // Cabeçalho
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...COR.cinza);
  doc.text('Prefeitura Municipal de Niterói · Secretaria de Conservação e Serviços Públicos', margem, 12);
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...COR.marca);
  doc.text('CADEX · Cadastro de Executores', margem, 17);
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...COR.tinta);
  doc.text(r.titulo, margem, 26);

  let y = 32;
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...COR.cinza);
  const total = totalLinhas(r);
  const linhasContexto = [
    ...r.filtros,
    `${total} ${total === 1 ? 'registro' : 'registros'}. Emitido em ${dataHora(agora)} por ${emitidoPor}.`,
  ];
  for (const linha of linhasContexto) {
    const partes = doc.splitTextToSize(linha, largura - 2 * margem) as string[];
    doc.text(partes, margem, y);
    y += partes.length * 4;
  }
  doc.setDrawColor(...COR.fio).setLineWidth(0.3).line(margem, y, largura - margem, y);

  // Corpo: um bloco por grupo, com a linha do grupo em destaque.
  const agrupado = r.grupos.some((g) => g.titulo);
  const corpo = r.grupos.flatMap((g) => [
    ...(agrupado ? [[{
      content: `${g.titulo} (${g.linhas.length})`,
      colSpan: r.colunas.length,
      styles: { fillColor: COR.grupo, textColor: COR.marca, fontStyle: 'bold' as const },
    }]] : []),
    ...g.linhas,
  ]);

  autoTable(doc, {
    head: [r.colunas],
    body: corpo.length ? corpo : [[{ content: 'Nenhum registro com esses filtros.', colSpan: r.colunas.length }]],
    startY: y + 3,
    margin: { left: margem, right: margem, top: 16, bottom: 16 },
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: paisagem ? 7.5 : 8.5, cellPadding: 1.6, textColor: COR.tinta, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: COR.marca, textColor: [255, 255, 255], fontStyle: 'bold' },
    bodyStyles: { lineColor: COR.fio, lineWidth: { bottom: 0.1 } },
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      // Nas páginas seguintes, só a identificação curta no topo.
      if (doc.getNumberOfPages() > 1) {
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...COR.cinza);
        doc.text(`CADEX · ${r.titulo}`, margem, 10);
      }
    },
  });

  // Rodapé com numeração (depois de saber o total de páginas).
  const paginas = doc.getNumberOfPages();
  const altura = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...COR.cinza);
    doc.text('Dados do cadastro no momento da emissão.', margem, altura - 8);
    doc.text(`Página ${p} de ${paginas}`, largura - margem, altura - 8, { align: 'right' });
  }
  return doc.output('blob');
}

export async function baixarPdf(r: Relatorio, emitidoPor: string, agora = new Date()) {
  const blob = await gerarPdf(r, emitidoPor, agora);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${r.arquivo}-${sufixoData(agora)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
