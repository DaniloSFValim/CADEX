import { formatCnpj } from './cnpj';
import {
  SITUACAO_LABEL, TIPO_LABEL, nomeEmpresa, situacaoEfetiva,
  type Empresa, type Resumo, type Vinculo,
} from './empresas';

// ---------------------------------------------------------------------
// CSV no padrão do Excel em português: separador `;`, BOM UTF-8 e CRLF.
// ---------------------------------------------------------------------

/**
 * Célula que começa com = + - @ vira fórmula no Excel (CSV injection):
 * prefixa com apóstrofo, que o Excel não mostra.
 */
export function celulaCsv(v: string): string {
  const seguro = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function gerarCsv(cabecalho: string[], linhas: string[][]): string {
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n';
}

export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------
// Colunas da relação de empresas
// ---------------------------------------------------------------------

export interface Contexto {
  hoje: string;
  porId: Map<string, Empresa>;
  vinculos: Vinculo[];
  /** Só para quem vê documentos (gestor). */
  resumoDocs?: (e: Empresa) => Resumo;
}

export interface Coluna {
  chave: string;
  rotulo: string;
  grupo: 'Identificação' | 'Inscrição' | 'Contato' | 'Vínculos' | 'Documentação';
  valor: (e: Empresa, c: Contexto) => string;
  /** Só aparece para quem vê documentos. */
  soGestor?: boolean;
}

const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

const contratantes = (e: Empresa, c: Contexto) =>
  c.vinculos.filter((v) => v.contratada_id === e.id && !v.fim)
    .map((v) => c.porId.get(v.contratante_id)).filter((x): x is Empresa => Boolean(x));

const contratadas = (e: Empresa, c: Contexto) =>
  c.vinculos.filter((v) => v.contratante_id === e.id && !v.fim)
    .map((v) => c.porId.get(v.contratada_id)).filter((x): x is Empresa => Boolean(x));

const nomes = (l: Empresa[]) => l.map((x) => `${nomeEmpresa(x)} (${x.codigo_cadex})`).join(', ');

export const COLUNAS: Coluna[] = [
  { chave: 'codigo', rotulo: 'Código CADEX', grupo: 'Identificação', valor: (e) => e.codigo_cadex },
  { chave: 'razao', rotulo: 'Razão social', grupo: 'Identificação', valor: (e) => e.razao_social },
  { chave: 'fantasia', rotulo: 'Nome fantasia', grupo: 'Identificação', valor: (e) => e.nome_fantasia ?? '' },
  { chave: 'cnpj', rotulo: 'CNPJ', grupo: 'Identificação', valor: (e) => formatCnpj(e.cnpj) },
  { chave: 'tipo', rotulo: 'Tipo', grupo: 'Identificação', valor: (e) => TIPO_LABEL[e.tipo] },

  { chave: 'situacao', rotulo: 'Situação', grupo: 'Inscrição',
    valor: (e, c) => SITUACAO_LABEL[situacaoEfetiva(e, c.hoje)] },
  { chave: 'processo', rotulo: 'Nº do processo', grupo: 'Inscrição', valor: (e) => e.processo_numero ?? '' },
  { chave: 'requerimento', rotulo: 'Data do requerimento', grupo: 'Inscrição', valor: (e) => dataBR(e.data_requerimento) },
  { chave: 'portaria', rotulo: 'Portaria', grupo: 'Inscrição', valor: (e) => e.portaria_numero ?? '' },
  { chave: 'portaria_data', rotulo: 'Data de publicação', grupo: 'Inscrição', valor: (e) => dataBR(e.portaria_data) },
  { chave: 'validade', rotulo: 'Válida até', grupo: 'Inscrição', valor: (e) => dataBR(e.validade_ate) },
  { chave: 'notificacao', rotulo: 'Notificação para saneamento', grupo: 'Inscrição', valor: (e) => dataBR(e.notificacao_data) },

  { chave: 'email', rotulo: 'E-mail', grupo: 'Contato', valor: (e) => e.email },
  { chave: 'telefone', rotulo: 'Telefone', grupo: 'Contato', valor: (e) => e.telefone ?? '' },
  { chave: 'endereco', rotulo: 'Endereço', grupo: 'Contato',
    valor: (e) => [
      [e.logradouro, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro,
      [e.cidade, e.uf].filter(Boolean).join('/'), e.cep && `CEP ${e.cep}`,
    ].filter(Boolean).join(' – ') },
  { chave: 'observacoes', rotulo: 'Observações', grupo: 'Contato', valor: (e) => e.observacoes ?? '' },

  { chave: 'contratantes', rotulo: 'Contratada por', grupo: 'Vínculos', valor: (e, c) => nomes(contratantes(e, c)) },
  { chave: 'contratadas', rotulo: 'Terceirizadas/subcontratadas', grupo: 'Vínculos', valor: (e, c) => nomes(contratadas(e, c)) },

  { chave: 'documentacao', rotulo: 'Documentação (art. 6º)', grupo: 'Documentação', soGestor: true,
    valor: (e, c) => {
      const r = c.resumoDocs?.(e);
      if (!r) return '';
      const partes = [
        r.faltando && `${r.faltando} pendente(s)`,
        r.vencidos && `${r.vencidos} vencido(s)`,
        r.vencendo && `${r.vencendo} vencendo`,
      ].filter(Boolean);
      return partes.length ? partes.join(', ') : 'Completa';
    } },
];

export const COLUNAS_PADRAO = ['codigo', 'razao', 'fantasia', 'cnpj', 'tipo', 'situacao', 'portaria', 'portaria_data', 'validade'];

export function relacaoCsv(empresas: Empresa[], chaves: string[], c: Contexto): string {
  const cols = COLUNAS.filter((col) => chaves.includes(col.chave));
  return gerarCsv(cols.map((col) => col.rotulo), empresas.map((e) => cols.map((col) => col.valor(e, c))));
}
