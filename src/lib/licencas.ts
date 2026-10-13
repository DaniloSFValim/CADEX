import type { Setor } from './empresas';
import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Licenças de obra de infraestrutura (arts. 10 a 14 e 26). O pedido é
// decidido no SEI; aqui fica o registro para consulta e fiscalização.
// ---------------------------------------------------------------------

export type TipoObra =
  | 'vala' | 'escavacao' | 'perfuracao_nao_destrutiva' | 'poste' | 'rede'
  | 'ligacao_predial' | 'galeria_drenagem' | 'boca_de_lobo' | 'recomposicao';
export type SituacaoLicenca = 'em_analise' | 'deferida' | 'indeferida' | 'cancelada';

/** Situação exibida: a deferida se desdobra conforme o cronograma e a conclusão. */
export type EstadoLicenca =
  | 'em_analise' | 'indeferida' | 'cancelada'
  | 'aguardando_inicio' | 'em_execucao' | 'prazo_encerrado'
  | 'concluida_sem_as_built' | 'concluida';

export interface Licenca {
  id: string;
  /** Telecom segue a Resolução nº 001/2026; os demais setores, regras mais leves. */
  setor: Setor;
  processo_sei: string;
  numero: string | null;
  tipos_obra: TipoObra[];
  escopo: string;
  /** Nulo só em licença anterior à Resolução com executora sem cadastro. */
  executora_id: string | null;
  contratante_id: string | null;
  /** Órgão público contratante (SEMOB, etc.): alternativa à empresa privada. */
  orgao_contratante_id: string | null;
  /** Empresa sem cadastro no CADEX (só em licença anterior à Resolução). */
  executora_razao_social: string | null;
  executora_cnpj: string | null;
  contratante_razao_social: string | null;
  contratante_cnpj: string | null;
  /** Dono do imóvel pessoa física (drenagem); o nome não é publicado. */
  contratante_cpf: string | null;
  /** Drenagem: imóvel ligado à rede e processo da obra no Urbanismo. */
  imovel_endereco: string | null;
  processo_urbanismo: string | null;
  /** Decisão anterior a 09/09/2026 (calculado no banco). */
  anterior_resolucao: boolean;
  subcontratada_id: string | null;
  responsavel_tecnico_id: string | null;
  art_numero: string | null;
  protocolo_data: string;
  situacao: SituacaoLicenca;
  decisao_data: string | null;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  concluida_em: string | null;
  /** Recomposição do pavimento (art. 26); a garantia corre a partir dela. */
  recomposicao_data: string | null;
  as_built_sei: string | null;
  as_built_data: string | null;
  observacoes: string | null;
  empresas_no_deferimento: Record<string, unknown> | null;
  /** Código aleatório do QR Code da placa (art. 14); não é o id interno. */
  codigo_publico: string;
  criado_em: string;
  atualizado_em: string;
}

export interface Trecho {
  id?: string;
  logradouro: string;
  bairro: string | null;
  referencia: string | null;
  inicio_lat: number;
  inicio_lng: number;
  fim_lat: number | null;
  fim_lng: number | null;
}

export interface LicencaComTrechos extends Licenca {
  licenca_trechos: (Trecho & { id: string; ordem: number })[];
}

/** Art. 10, na ordem da Resolução. */
export const TIPO_OBRA_LABEL: Record<TipoObra, string> = {
  vala: 'Abertura de vala',
  escavacao: 'Escavação a céu aberto',
  perfuracao_nao_destrutiva: 'Perfuração não destrutiva',
  poste: 'Implantação de poste',
  rede: 'Instalação ou expansão de rede',
  ligacao_predial: 'Ligação de imóvel à rede pública',
  galeria_drenagem: 'Galeria ou rede de drenagem',
  boca_de_lobo: 'Boca de lobo ou caixa de ralo',
  recomposicao: 'Recomposição de calçada ou pavimento',
};

/** Licença em que valem as regras da Resolução (só telecom, a partir de 09/09/2026). */
export const segueResolucao = (setor: Setor, decisao: string | null) =>
  setor === 'telecom' && !anteriorResolucao(decisao);

export const SITUACAO_LICENCA_LABEL: Record<SituacaoLicenca, string> = {
  em_analise: 'Em análise',
  deferida: 'Deferida',
  indeferida: 'Indeferida',
  cancelada: 'Cancelada',
};

export const ESTADO_LICENCA_LABEL: Record<EstadoLicenca, string> = {
  em_analise: 'Em análise',
  indeferida: 'Indeferida',
  cancelada: 'Cancelada',
  aguardando_inicio: 'Aguardando início',
  em_execucao: 'Em execução',
  prazo_encerrado: 'Prazo encerrado',
  concluida_sem_as_built: 'Sem As Built',
  concluida: 'Concluída',
};

export const TOM_ESTADO_LICENCA: Record<EstadoLicenca, 'neutro' | 'bom' | 'alerta' | 'ruim'> = {
  em_analise: 'neutro',
  indeferida: 'neutro',
  cancelada: 'neutro',
  aguardando_inicio: 'neutro',
  em_execucao: 'bom',
  prazo_encerrado: 'ruim',
  concluida_sem_as_built: 'alerta',
  concluida: 'bom',
};

/**
 * Contratante e executora são a mesma empresa cadastrada: a titular executa a
 * própria obra. Um só cadastro, nos dois papéis.
 */
export const mesmaEmpresaNosPapeis = (l: { contratante_id: string | null; executora_id: string | null }) =>
  Boolean(l.contratante_id) && l.contratante_id === l.executora_id;

/** Situações que o registro oferece. "Indeferida" só aparece em licença que já está indeferida (histórico). */
export function situacoesRegistraveis<T extends string>(todas: readonly T[], atual: SituacaoLicenca | null): T[] {
  return todas.filter((s) => s !== 'indeferida' || atual === 'indeferida');
}

/**
 * Período da obra ou serviço (início e fim, em AAAA-MM-DD). O início em branco
 * vale a data da decisão, como no envio. Devolve a mensagem do erro, ou nulo.
 */
export function erroPeriodoObra(p: {
  deferida: boolean; decisao: string; inicio: string; fim: string; concluidaEm: string;
}): string | null {
  if (!p.deferida) return null;
  const inicio = p.inicio || p.decisao;
  if (inicio && p.fim && p.fim < inicio) return 'O fim da obra ou serviço não pode ser anterior ao início.';
  if (inicio && p.concluidaEm && p.concluidaEm < inicio) {
    return 'A conclusão não pode ser anterior ao início da obra ou serviço.';
  }
  return null;
}

export function estadoLicenca(
  l: Pick<Licenca, 'situacao' | 'inicio_previsto' | 'fim_previsto' | 'concluida_em' | 'as_built_sei'>,
  hoje: string,
): EstadoLicenca {
  if (l.situacao !== 'deferida') return l.situacao;
  if (l.concluida_em) return l.as_built_sei ? 'concluida' : 'concluida_sem_as_built';
  if (l.inicio_previsto && hoje < l.inicio_previsto) return 'aguardando_inicio';
  if (l.fim_previsto && hoje > l.fim_previsto) return 'prazo_encerrado';
  return 'em_execucao';
}

// ---------------------------------------------------------------------
// Licenças anteriores à Resolução (registro histórico)
// ---------------------------------------------------------------------
/** Publicação da Resolução Conjunta nº 001/2026; mesma data do banco. */
export const DATA_RESOLUCAO = '2026-09-09';

/** Decisão antes da Resolução: registro histórico, com regras próprias. */
export const anteriorResolucao = (decisao: string | null) => Boolean(decisao) && decisao! < DATA_RESOLUCAO;

/** Nome da executora, cadastrada ou digitada. */
export function nomeExecutora(
  l: Pick<Licenca, 'executora_id' | 'executora_razao_social'>, porId: Map<string, { razao_social: string; nome_fantasia: string | null }>,
): string {
  const e = l.executora_id ? porId.get(l.executora_id) : undefined;
  return e ? (e.nome_fantasia?.trim() || e.razao_social) : (l.executora_razao_social ?? '—');
}

// ---------------------------------------------------------------------
// Coordenadas coladas do Google Maps (ou digitadas)
// ---------------------------------------------------------------------
/** Mesma faixa do banco: larga em volta de Niterói, pega lat/lng trocadas. */
const LAT = [-23.1, -22.75] as const;
const LNG = [-43.25, -42.85] as const;
const dentro = (x: number, [a, b]: readonly [number, number]) => x >= a && x <= b;

/**
 * Aceita "-22.8950, -43.1230", "-22.8950 -43.1230", um link do Google
 * Maps (…/@-22.89,-43.12,17z ou …!3d-22.89!4d-43.12) e o par invertido.
 * Devolve nulo se não reconhecer ou se cair fora de Niterói.
 */
export function lerCoordenada(texto: string): { lat: number; lng: number } | null {
  const t = texto.trim();
  if (!t) return null;
  const pares: [string, string][] = [];
  const d34 = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (d34) pares.push([d34[1], d34[2]]);
  const arroba = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (arroba) pares.push([arroba[1], arroba[2]]);
  const simples = t.match(/(-?\d+\.\d+)\s*[,;\s]\s*(-?\d+\.\d+)/);
  if (simples) pares.push([simples[1], simples[2]]);

  for (const [a, b] of pares) {
    const x = Number(a);
    const y = Number(b);
    if (dentro(x, LAT) && dentro(y, LNG)) return { lat: x, lng: y };
    if (dentro(y, LAT) && dentro(x, LNG)) return { lat: y, lng: x };
  }
  return null;
}

export const coordenadaTexto = (lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

/** Abre o ponto (ou o trecho, como rota a pé) no Google Maps, em outra aba. */
export function linkMapa(t: Pick<Trecho, 'inicio_lat' | 'inicio_lng' | 'fim_lat' | 'fim_lng'>): string {
  const a = `${t.inicio_lat},${t.inicio_lng}`;
  if (t.fim_lat == null || t.fim_lng == null) return `https://www.google.com/maps/search/?api=1&query=${a}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${a}&destination=${t.fim_lat},${t.fim_lng}&travelmode=walking`;
}

// ---------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------
export async function listarLicencas(empresaId?: string): Promise<LicencaComTrechos[]> {
  let q = supabase.from('licencas').select('*, licenca_trechos(*)').order('protocolo_data', { ascending: false });
  if (empresaId) {
    q = q.or(`executora_id.eq.${empresaId},contratante_id.eq.${empresaId},subcontratada_id.eq.${empresaId}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data as LicencaComTrechos[]).map(ordenarTrechos);
}

export async function buscarLicenca(id: string): Promise<LicencaComTrechos> {
  const { data, error } = await supabase.from('licencas').select('*, licenca_trechos(*)').eq('id', id).single();
  if (error) throw error;
  return ordenarTrechos(data as LicencaComTrechos);
}

function ordenarTrechos(l: LicencaComTrechos): LicencaComTrechos {
  return { ...l, licenca_trechos: [...(l.licenca_trechos ?? [])].sort((a, b) => a.ordem - b.ordem) };
}

export type LicencaInput = Omit<Licenca,
  'id' | 'empresas_no_deferimento' | 'codigo_publico' | 'anterior_resolucao' | 'criado_em' | 'atualizado_em'> & { id?: string };

/** Grava licença e trechos numa só transação (função salvar_licenca). */
export async function salvarLicenca(licenca: LicencaInput, trechos: Trecho[]): Promise<string> {
  const { data, error } = await supabase.rpc('salvar_licenca', { p_licenca: licenca, p_trechos: trechos });
  if (error) throw error;
  return data as string;
}

export async function excluirLicenca(id: string): Promise<void> {
  const { error } = await supabase.from('licencas').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Conflito espaço-temporal: obras a até 15 m, no mesmo período (vigente)
// ou ainda na garantia da recomposição. É aviso, nunca bloqueia.
// ---------------------------------------------------------------------
export interface Conflito {
  tipo: 'vigente' | 'recomposicao';
  licenca_id: string;
  numero: string | null;
  processo_sei: string;
  executora: string | null;
  distancia_m: number;
  logradouro: string | null;
  /** Fim do cronograma (vigente) ou fim da garantia (recomposição). */
  ate: string | null;
}

export async function buscarConflitos(id: string): Promise<Conflito[]> {
  const { data, error } = await supabase.rpc('conflitos_de_licenca', { p_id: id });
  if (error) throw error;
  return (data as Conflito[]) ?? [];
}

// ---------------------------------------------------------------------
// Página pública da licença (QR Code da placa, art. 14): sem login
// ---------------------------------------------------------------------
export type SituacaoPublica = 'vigente' | 'aguardando_inicio' | 'prazo_encerrado' | 'concluida' | 'cancelada';

export interface LicencaPublica {
  setor: Setor;
  numero: string;
  tipos_obra: TipoObra[];
  escopo: string;
  inicio_previsto: string;
  fim_previsto: string;
  concluida_em: string | null;
  situacao: SituacaoPublica;
  /** Data de hoje em Niterói, segundo o banco. */
  hoje: string;
  anterior_resolucao: boolean;
  /** Drenagem: imóvel ligado à rede pública. */
  imovel_endereco: string | null;
  /** Sem código nem situação: empresa sem cadastro, em licença anterior à Resolução. */
  executora: { razao_social: string; nome_fantasia: string | null; codigo_cadex: string | null; situacao_cadex: string | null };
  contratante: { razao_social: string; nome_fantasia: string | null; codigo_cadex: string | null } | null;
  trechos: Omit<Trecho, 'id'>[];
}

/** Nulo: código inexistente, ou pedido ainda não deferido. */
export async function buscarLicencaPublica(codigo: string): Promise<LicencaPublica | null> {
  const { data, error } = await supabase.rpc('licenca_publica', { p_codigo: codigo });
  if (error) throw error;
  return (data as LicencaPublica | null) ?? null;
}

/** Endereço que vai no QR Code. Usa o domínio em que o sistema está aberto. */
export const urlPublicaLicenca = (codigo: string, origem = window.location.origin) => `${origem}/licenca/${codigo}`;

// ---------------------------------------------------------------------
// Pendências para o painel do gestor
// ---------------------------------------------------------------------
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

export interface PendenciaLicenca { licenca: LicencaComTrechos; dias: number }

/**
 * Licenças que pedem providência da SECONSER: prazo do cronograma
 * encerrado sem conclusão registrada, e obra concluída sem As Built
 * (art. 26). Só as emitidas sob a Resolução entram nas listas; as
 * anteriores (registro histórico) só são contadas, porque costumam vir
 * sem dados de conclusão e encheriam o painel.
 */
export function pendenciasLicencas(licencas: LicencaComTrechos[], hoje: string) {
  const prazoEncerrado: PendenciaLicenca[] = [];
  const semAsBuilt: PendenciaLicenca[] = [];
  const semRecomposicao: PendenciaLicenca[] = [];
  let historicasEmAberto = 0;
  for (const l of licencas) {
    // Obra concluída sem a recomposição do pavimento registrada (exceto histórica).
    if (l.concluida_em && !l.recomposicao_data && l.situacao === 'deferida' && !l.anterior_resolucao) {
      semRecomposicao.push({ licenca: l, dias: diasEntre(l.concluida_em, hoje) });
    }
    const e = estadoLicenca(l, hoje);
    if (e !== 'prazo_encerrado' && e !== 'concluida_sem_as_built') continue;
    if (l.anterior_resolucao) { historicasEmAberto++; continue; }
    if (e === 'prazo_encerrado') prazoEncerrado.push({ licenca: l, dias: diasEntre(l.fim_previsto!, hoje) });
    else semAsBuilt.push({ licenca: l, dias: diasEntre(l.concluida_em!, hoje) });
  }
  // Mais atrasadas primeiro.
  prazoEncerrado.sort((a, b) => b.dias - a.dias);
  semAsBuilt.sort((a, b) => b.dias - a.dias);
  semRecomposicao.sort((a, b) => b.dias - a.dias);
  return { prazoEncerrado, semAsBuilt, semRecomposicao, historicasEmAberto };
}

// ---------------------------------------------------------------------
// Desempenho da executora (scorecard) — inspirado nos indicadores de
// street works do HAUC/GeoPlace (Reino Unido): pontualidade, recomposição
// e As Built. Alimenta a decisão de manter a inscrição APTA. Só conta as
// obras sob a Resolução (as históricas vêm sem dados de conclusão).
//
// Fica de fora a "taxa de defeito": depende de registro de inspeção, que
// o CADEX ainda não tem (seria o passo seguinte).
// ---------------------------------------------------------------------
export type NivelDesempenho = 'bom' | 'alerta' | 'ruim' | 'sem_dados';

export interface Desempenho {
  obras: number;        // deferidas como executora, sob a Resolução
  concluidas: number;
  noPrazo: number;      // concluída até o fim do cronograma
  atrasadas: number;    // prazo do cronograma encerrado sem conclusão
  recompostas: number;  // concluídas com o pavimento recomposto
  comAsBuilt: number;   // concluídas com As Built (art. 26)
  nivel: NivelDesempenho;
}

export function desempenhoExecutora(
  licencas: Pick<Licenca, 'executora_id' | 'situacao' | 'anterior_resolucao' | 'concluida_em'
    | 'fim_previsto' | 'inicio_previsto' | 'recomposicao_data' | 'as_built_sei'>[],
  empresaId: string,
  hoje: string,
): Desempenho {
  const base = licencas.filter((l) => l.executora_id === empresaId && l.situacao === 'deferida' && !l.anterior_resolucao);
  const concluidas = base.filter((l) => l.concluida_em);
  const noPrazo = concluidas.filter((l) => l.fim_previsto && l.concluida_em! <= l.fim_previsto).length;
  const atrasadas = base.filter((l) => estadoLicenca(l, hoje) === 'prazo_encerrado').length;
  const recompostas = concluidas.filter((l) => l.recomposicao_data).length;
  const comAsBuilt = concluidas.filter((l) => l.as_built_sei).length;

  let nivel: NivelDesempenho;
  if (base.length === 0) nivel = 'sem_dados';
  else if (atrasadas > 0) nivel = 'ruim';
  else if (recompostas < concluidas.length || comAsBuilt < concluidas.length || noPrazo < concluidas.length) nivel = 'alerta';
  else nivel = 'bom';

  return { obras: base.length, concluidas: concluidas.length, noPrazo, atrasadas, recompostas, comAsBuilt, nivel };
}
