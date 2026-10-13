import { somaDias } from './empresas';
import {
  estadoLicenca, type EstadoLicenca, type LicencaComTrechos, type SituacaoLicenca, type TipoObra,
} from './licencas';

// ---------------------------------------------------------------------
// Painel gerencial: tudo que o painel mostra sai daqui, calculado sobre as
// licenças reais já carregadas. Funções puras: o mesmo conjunto filtrado
// alimenta indicadores, gráficos e listas, então os números sempre batem.
//
// Situação operacional: o CADEX não guarda a data efetiva de início da obra,
// só o período previsto (início e fim) e a conclusão registrada. Por isso
// "em andamento" quer dizer "licença deferida, sem conclusão registrada, com o
// período previsto em curso". Nada é dado como começado ou terminado só porque
// uma data passou: obra com o fim vencido e sem conclusão aparece à parte.
// ---------------------------------------------------------------------

/**
 * Filtro de status: situação operacional ("estado:"), administrativa
 * ("situacao:") ou o grupo das concluídas (com ou sem As Built).
 */
export type FiltroStatus = '' | `estado:${EstadoLicenca}` | `situacao:${SituacaoLicenca}` | 'grupo:concluidas';

export interface Filtros {
  /** Período da obra ou serviço: a licença entra se o seu período cruza [de, ate]. Vazio = aberto. */
  de: string;
  ate: string;
  status: FiltroStatus;
  /** Chave de uma parte (ver `parteDe`), ou vazio. */
  contratante: string;
  executora: string;
  tipo: TipoObra | '';
}

export const SEM_FILTROS: Filtros = { de: '', ate: '', status: '', contratante: '', executora: '', tipo: '' };

export const temFiltro = (f: Filtros) => Object.values(f).some(Boolean);

// ---------------------------------------------------------------------
// Contratante e executora
// ---------------------------------------------------------------------
export interface ContextoPartes {
  empresas: Map<string, { razao_social: string; nome_fantasia: string | null }>;
  orgaos: Map<string, { nome: string; sigla: string | null }>;
}

export type TipoParte = 'empresa' | 'orgao' | 'sem_cadastro' | 'particular';

export interface Parte { chave: string; rotulo: string; tipo: TipoParte }

const norm = (s: string | null) => (s ?? '').trim().toLowerCase();
const nomeEmpresaCurto = (e: { razao_social: string; nome_fantasia: string | null }) =>
  e.nome_fantasia?.trim() || e.razao_social;

/**
 * Quem ocupa o papel na licença, com uma chave estável: a mesma pessoa jurídica
 * tem sempre a mesma chave, e uma licença tem no máximo uma contratante e uma
 * executora, então somar por chave nunca conta a mesma licença duas vezes.
 * Contratante e executora iguais (a titular que executa a própria obra) têm a
 * mesma chave nos dois papéis.
 */
export function parteDe(
  l: LicencaComTrechos, papel: 'contratante' | 'executora', c: ContextoPartes,
): Parte | null {
  const empresaId = papel === 'contratante' ? l.contratante_id : l.executora_id;
  if (empresaId) {
    const e = c.empresas.get(empresaId);
    return { chave: `e:${empresaId}`, rotulo: e ? nomeEmpresaCurto(e) : 'Empresa não encontrada', tipo: 'empresa' };
  }
  if (papel === 'contratante') {
    if (l.orgao_contratante_id) {
      const o = c.orgaos.get(l.orgao_contratante_id);
      return { chave: `o:${l.orgao_contratante_id}`, rotulo: o ? (o.sigla || o.nome) : 'Órgão não encontrado', tipo: 'orgao' };
    }
    // Dono do imóvel pessoa física: o nome não é tratado aqui; todos juntos.
    if (l.contratante_cpf) return { chave: 'p:pf', rotulo: 'Particular (pessoa física)', tipo: 'particular' };
  }
  const razao = papel === 'contratante' ? l.contratante_razao_social : l.executora_razao_social;
  const cnpj = papel === 'contratante' ? l.contratante_cnpj : l.executora_cnpj;
  if (razao) return { chave: `t:${cnpj || norm(razao)}`, rotulo: razao, tipo: 'sem_cadastro' };
  return null;
}

/** Partes distintas de um papel, em ordem alfabética (para as listas de filtro). */
export function partesDistintas(ls: LicencaComTrechos[], papel: 'contratante' | 'executora', c: ContextoPartes): Parte[] {
  const m = new Map<string, Parte>();
  for (const l of ls) {
    const p = parteDe(l, papel, c);
    if (p && !m.has(p.chave)) m.set(p.chave, p);
  }
  return [...m.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

// ---------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------
/** Período da licença para o filtro: início e fim previstos; sem eles, a data da decisão ou do protocolo. */
function periodoDaLicenca(l: LicencaComTrechos): { inicio: string; fim: string } {
  const ref = l.decisao_data ?? l.protocolo_data;
  const inicio = l.inicio_previsto ?? ref;
  const fim = l.fim_previsto ?? inicio;
  return { inicio, fim };
}

function casaStatus(l: LicencaComTrechos, status: Exclude<FiltroStatus, ''>, hoje: string): boolean {
  if (status === 'grupo:concluidas') {
    const e = estadoLicenca(l, hoje);
    return e === 'concluida' || e === 'concluida_sem_as_built';
  }
  const [tipo, valor] = status.split(':');
  return tipo === 'estado' ? estadoLicenca(l, hoje) === valor : l.situacao === valor;
}

export function aplicarFiltros(
  ls: LicencaComTrechos[], f: Filtros, hoje: string, c: ContextoPartes,
): LicencaComTrechos[] {
  return ls.filter((l) => {
    const { inicio, fim } = periodoDaLicenca(l);
    if (f.de && fim < f.de) return false;
    if (f.ate && inicio > f.ate) return false;
    if (f.status && !casaStatus(l, f.status, hoje)) return false;
    if (f.contratante && parteDe(l, 'contratante', c)?.chave !== f.contratante) return false;
    if (f.executora && parteDe(l, 'executora', c)?.chave !== f.executora) return false;
    if (f.tipo && !l.tipos_obra.includes(f.tipo)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------
const ESTADOS: EstadoLicenca[] = [
  'em_analise', 'indeferida', 'cancelada', 'aguardando_inicio', 'em_execucao',
  'prazo_encerrado', 'concluida_sem_as_built', 'concluida',
];

export interface ContagemPartes { total: number; empresas: number; orgaos: number; outras: number }

export interface Indicadores {
  total: number;
  porEstado: Record<EstadoLicenca, number>;
  /** Deferida, sem conclusão, com o início previsto ainda por vir. */
  programadas: number;
  /** Deferida, sem conclusão, com o período previsto em curso. */
  emAndamento: number;
  /** Conclusão registrada (com ou sem As Built). */
  concluidas: number;
  /** Deferida, sem conclusão registrada, com o fim previsto vencido. */
  prazoVencido: number;
  /** Deferidas, sem conclusão, com início previsto de hoje até hoje + janela. */
  iniciamNaJanela: number;
  /** Deferidas, sem conclusão, com fim previsto de hoje até hoje + janela. */
  terminamNaJanela: number;
  contratantes: ContagemPartes;
  executoras: ContagemPartes;
}

const contar = (ls: LicencaComTrechos[], papel: 'contratante' | 'executora', c: ContextoPartes): ContagemPartes => {
  const partes = new Map<string, Parte>();
  for (const l of ls) {
    const p = parteDe(l, papel, c);
    if (p) partes.set(p.chave, p);
  }
  let empresas = 0; let orgaos = 0; let outras = 0;
  for (const p of partes.values()) {
    if (p.tipo === 'empresa') empresas++; else if (p.tipo === 'orgao') orgaos++; else outras++;
  }
  return { total: partes.size, empresas, orgaos, outras };
};

export function indicadores(ls: LicencaComTrechos[], hoje: string, janelaDias: number, c: ContextoPartes): Indicadores {
  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoLicenca, number>;
  const limite = somaDias(hoje, janelaDias);
  let iniciam = 0; let terminam = 0;
  for (const l of ls) {
    porEstado[estadoLicenca(l, hoje)]++;
    const aberta = l.situacao === 'deferida' && !l.concluida_em;
    if (aberta && l.inicio_previsto && l.inicio_previsto >= hoje && l.inicio_previsto <= limite) iniciam++;
    if (aberta && l.fim_previsto && l.fim_previsto >= hoje && l.fim_previsto <= limite) terminam++;
  }
  return {
    total: ls.length,
    porEstado,
    programadas: porEstado.aguardando_inicio,
    emAndamento: porEstado.em_execucao,
    concluidas: porEstado.concluida + porEstado.concluida_sem_as_built,
    prazoVencido: porEstado.prazo_encerrado,
    iniciamNaJanela: iniciam,
    terminamNaJanela: terminam,
    contratantes: contar(ls, 'contratante', c),
    executoras: contar(ls, 'executora', c),
  };
}

/** Situação administrativa registrada (a decisão), sem desdobrar a deferida. */
export function porSituacaoAdministrativa(ls: LicencaComTrechos[]): Record<SituacaoLicenca, number> {
  const r: Record<SituacaoLicenca, number> = { em_analise: 0, deferida: 0, indeferida: 0, cancelada: 0 };
  for (const l of ls) r[l.situacao]++;
  return r;
}

// ---------------------------------------------------------------------
// Distribuições
// ---------------------------------------------------------------------
export interface Barra { chave: string; rotulo: string; n: number }

/**
 * Licenças por contratante ou executora, da maior para a menor. Passando de
 * `max`, o restante vira "Demais" (a chave vazia não é filtrável).
 */
export function distribuicaoPorParte(
  ls: LicencaComTrechos[], papel: 'contratante' | 'executora', c: ContextoPartes, max = 8,
): { barras: Barra[]; semInformacao: number; demais: number } {
  const m = new Map<string, Barra>();
  let semInformacao = 0;
  for (const l of ls) {
    const p = parteDe(l, papel, c);
    if (!p) { semInformacao++; continue; }
    const b = m.get(p.chave);
    if (b) b.n++; else m.set(p.chave, { chave: p.chave, rotulo: p.rotulo, n: 1 });
  }
  const todas = [...m.values()].sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const barras = todas.slice(0, max);
  const demais = todas.slice(max).reduce((s, b) => s + b.n, 0);
  return { barras, semInformacao, demais };
}

export type RefData = 'decisao' | 'registro';

/** AAAA-MM de uma data ISO (a de um timestamp usa os dez primeiros caracteres). */
const mesDe = (iso: string) => iso.slice(0, 7);

function proximoMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Licenças por mês, sem buracos: meses sem licença aparecem com zero.
 * `decisao` agrupa pela data da decisão; `registro`, pelo dia em que a licença
 * entrou no CADEX. Quem não tem a data escolhida vai em `semData`.
 */
export function evolucaoMensal(ls: LicencaComTrechos[], ref: RefData): { meses: { mes: string; n: number }[]; semData: number } {
  const cont = new Map<string, number>();
  let semData = 0;
  for (const l of ls) {
    const d = ref === 'decisao' ? l.decisao_data : l.criado_em;
    if (!d) { semData++; continue; }
    cont.set(mesDe(d), (cont.get(mesDe(d)) ?? 0) + 1);
  }
  if (cont.size === 0) return { meses: [], semData };
  const ordenados = [...cont.keys()].sort();
  const meses: { mes: string; n: number }[] = [];
  for (let m = ordenados[0]; m <= ordenados[ordenados.length - 1]; m = proximoMes(m)) {
    meses.push({ mes: m, n: cont.get(m) ?? 0 });
  }
  return { meses, semData };
}

// ---------------------------------------------------------------------
// Listas e linha do tempo
// ---------------------------------------------------------------------
/** Deferidas, sem conclusão, com o início ou o fim previsto de hoje até hoje + dias (a mais próxima primeiro). */
export function proximas(
  ls: LicencaComTrechos[], hoje: string, dias: number, evento: 'inicio' | 'fim',
): LicencaComTrechos[] {
  const limite = somaDias(hoje, dias);
  const data = (l: LicencaComTrechos) => (evento === 'inicio' ? l.inicio_previsto : l.fim_previsto);
  return ls
    .filter((l) => {
      const d = data(l);
      return l.situacao === 'deferida' && !l.concluida_em && d != null && d >= hoje && d <= limite;
    })
    .sort((a, b) => data(a)!.localeCompare(data(b)!));
}

/** As licenças registradas mais recentemente (pelo dia de entrada no CADEX). */
export const maisRecentes = (ls: LicencaComTrechos[], n: number) =>
  [...ls].sort((a, b) => b.criado_em.localeCompare(a.criado_em)).slice(0, n);

export interface ItemLinha {
  id: string;
  numero: string | null;
  processo: string;
  inicio: string;
  fim: string;
  estado: EstadoLicenca;
  /** Posição e largura na janela, em % (0 a 100). */
  esq: number;
  larg: number;
}

const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/**
 * Licenças com período cruzando a janela [de, ate], para a linha do tempo.
 * Só entram as que têm início e fim previstos. Devolve no máximo `max`, as de
 * início mais antigo primeiro, e quantas ficaram de fora.
 */
export function linhaDoTempo(
  ls: LicencaComTrechos[], hoje: string, janela: { de: string; ate: string }, max = 30,
): { itens: ItemLinha[]; omitidas: number; semPeriodo: number } {
  const total = dia(janela.ate) - dia(janela.de);
  const noPeriodo: ItemLinha[] = [];
  let semPeriodo = 0;
  for (const l of ls) {
    if (!l.inicio_previsto || !l.fim_previsto) { semPeriodo++; continue; }
    if (l.fim_previsto < janela.de || l.inicio_previsto > janela.ate) continue;
    const ini = Math.max(dia(l.inicio_previsto), dia(janela.de));
    const fim = Math.min(dia(l.fim_previsto), dia(janela.ate));
    noPeriodo.push({
      id: l.id, numero: l.numero, processo: l.processo_sei, inicio: l.inicio_previsto, fim: l.fim_previsto,
      estado: estadoLicenca(l, hoje),
      esq: ((ini - dia(janela.de)) / total) * 100,
      // Um dia de largura no mínimo, para a licença de um dia não sumir.
      larg: Math.max(((fim - ini + 1) / total) * 100, 0.6),
    });
  }
  noPeriodo.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.processo.localeCompare(b.processo));
  return { itens: noPeriodo.slice(0, max), omitidas: Math.max(noPeriodo.length - max, 0), semPeriodo };
}

/** Posição de uma data na janela, em % (para a marca de "hoje"). */
export const posicaoNaJanela = (iso: string, janela: { de: string; ate: string }) =>
  ((dia(iso) - dia(janela.de)) / (dia(janela.ate) - dia(janela.de))) * 100;
