import { SETOR_LABEL, nomeEmpresa, type Empresa } from './empresas';
import {
  ESTADO_LICENCA_LABEL, TIPO_OBRA_LABEL, estadoLicenca, nomeExecutora, type LicencaComTrechos, type TipoObra,
} from './licencas';
import { agrupar, type Relatorio } from './relatorio';

/** Relação de licenças de obra como relatório (PDF ou planilha). */
export interface ContextoLicencas { hoje: string; porId: Map<string, Empresa> }

interface ColunaLicenca {
  chave: string;
  rotulo: string;
  valor: (l: LicencaComTrechos, c: ContextoLicencas) => string;
}

const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

const contratante = (l: LicencaComTrechos, c: ContextoLicencas) => {
  const e = l.contratante_id ? c.porId.get(l.contratante_id) : undefined;
  // Pessoa física (dono do imóvel na drenagem) entra só como "Particular".
  return e ? nomeEmpresa(e) : l.contratante_cpf ? 'Particular (pessoa física)' : (l.contratante_razao_social ?? '');
};

export const COLUNAS_LICENCA: ColunaLicenca[] = [
  { chave: 'numero', rotulo: 'Licença', valor: (l) => l.numero ?? 'Sem número' },
  { chave: 'processo', rotulo: 'Processo', valor: (l) => l.processo_sei },
  { chave: 'setor', rotulo: 'Setor', valor: (l) => SETOR_LABEL[l.setor] },
  { chave: 'tipos', rotulo: 'Tipo de obra', valor: (l) => l.tipos_obra.map((t) => TIPO_OBRA_LABEL[t as TipoObra] ?? t).join(', ') },
  { chave: 'escopo', rotulo: 'Escopo', valor: (l) => l.escopo },
  { chave: 'executora', rotulo: 'Executora', valor: (l, c) => nomeExecutora(l, c.porId) },
  { chave: 'contratante', rotulo: 'Contratante', valor: contratante },
  { chave: 'subcontratada', rotulo: 'Subcontratada',
    valor: (l, c) => { const e = l.subcontratada_id ? c.porId.get(l.subcontratada_id) : undefined; return e ? nomeEmpresa(e) : ''; } },
  { chave: 'local', rotulo: 'Local',
    valor: (l) => l.licenca_trechos.map((t) => [t.logradouro, t.bairro].filter(Boolean).join(', ')).join('; ') },
  { chave: 'imovel', rotulo: 'Imóvel atendido', valor: (l) => l.imovel_endereco ?? '' },
  { chave: 'inicio', rotulo: 'Início da obra ou serviço', valor: (l) => dataBR(l.inicio_previsto) },
  { chave: 'fim', rotulo: 'Fim da obra ou serviço', valor: (l) => dataBR(l.fim_previsto) },
  { chave: 'protocolo', rotulo: 'Protocolo', valor: (l) => dataBR(l.protocolo_data) },
  { chave: 'situacao', rotulo: 'Situação', valor: (l, c) => ESTADO_LICENCA_LABEL[estadoLicenca(l, c.hoje)] },
  { chave: 'art', rotulo: 'ART/RRT', valor: (l) => l.art_numero ?? '' },
  { chave: 'conclusao', rotulo: 'Conclusão', valor: (l) => dataBR(l.concluida_em) },
  { chave: 'asbuilt', rotulo: 'As Built',
    valor: (l) => (l.as_built_sei ? `${l.as_built_sei} (${dataBR(l.as_built_data)})` : '') },
];

export const COLUNAS_LICENCA_PADRAO = ['numero', 'processo', 'setor', 'executora', 'local', 'inicio', 'fim', 'situacao'];

export const AGRUPAR_LICENCAS = [
  { valor: '', rotulo: 'Sem agrupamento' },
  { valor: 'setor', rotulo: 'Setor' },
  { valor: 'situacao', rotulo: 'Situação' },
  { valor: 'executora', rotulo: 'Executora' },
  { valor: 'contratante', rotulo: 'Contratante' },
  { valor: 'bairro', rotulo: 'Bairro' },
  { valor: 'ano', rotulo: 'Ano do protocolo' },
] as const;

export type AgrupamentoLicencas = (typeof AGRUPAR_LICENCAS)[number]['valor'];

function grupos(l: LicencaComTrechos, por: AgrupamentoLicencas, c: ContextoLicencas): string[] {
  switch (por) {
    case 'setor': return [SETOR_LABEL[l.setor]];
    case 'situacao': return [ESTADO_LICENCA_LABEL[estadoLicenca(l, c.hoje)]];
    case 'executora': return [nomeExecutora(l, c.porId)];
    case 'contratante': return [contratante(l, c) || 'Sem contratante'];
    case 'bairro': {
      const b = [...new Set(l.licenca_trechos.map((t) => t.bairro?.trim()).filter((x): x is string => Boolean(x)))];
      return b.length ? b : ['Sem bairro informado'];
    }
    case 'ano': return [l.protocolo_data ? l.protocolo_data.slice(0, 4) : 'Sem protocolo'];
    default: return [''];
  }
}

export function relacaoLicencas(
  licencas: LicencaComTrechos[], chaves: string[], c: ContextoLicencas, por: AgrupamentoLicencas, filtros: string[],
): Relatorio {
  const cols = COLUNAS_LICENCA.filter((col) => chaves.includes(col.chave));
  const rotulo = AGRUPAR_LICENCAS.find((a) => a.valor === por)?.rotulo;
  return {
    titulo: 'Relação de licenças de obra',
    arquivo: 'cadex-licencas',
    filtros: por ? [...filtros, `Agrupado por: ${rotulo?.toLowerCase()}.`] : filtros,
    colunas: cols.map((col) => col.rotulo),
    grupos: [...agrupar(licencas, (l) => grupos(l, por, c)).entries()]
      .map(([titulo, lista]) => ({ titulo, linhas: lista.map((l) => cols.map((col) => col.valor(l, c))) })),
  };
}
