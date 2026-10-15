import { BUCKET, BUCKET_LOGOS, supabase } from './supabase';
import { onlyDigits } from './cnpj';
import { nomeOrgao, type Orgao } from './orgaos';

/**
 * Papel da empresa. Operadora (telecom), concessionária (gás ou
 * saneamento) e construtora contratam; terceirizada executa.
 */
export type Tipo = 'operadora' | 'concessionaria' | 'construtora' | 'terceirizada';
/** Setores de obras e serviços em via pública. */
export type Setor = 'telecom' | 'gas' | 'saneamento' | 'drenagem' | 'construcao' | 'viario';
/** Perfil que define os documentos exigidos (tipos_documento.perfis). */
export type Perfil = 'telecom' | 'gas' | 'saneamento' | 'construtora' | 'terceirizada';
/** Situação da inscrição no CADEX (arts. 7º e 8º). */
export type Situacao = 'em_analise' | 'deferida' | 'apta' | 'em_saneamento' | 'inapta';
/** Situação exibida: inclui VENCIDA, calculada pela validade. */
export type SituacaoEfetiva = Situacao | 'vencida';

export interface Empresa {
  id: string;
  codigo_cadex: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  tipo: Tipo;
  /** Operadora: telecom. Concessionária: gás ou saneamento. Construtora:
   *  construção. Terceirizada: um ou mais. */
  setores: Setor[];
  email: string;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  /** Representante legal da empresa (para a relação oficial de executores). */
  representante: string | null;
  /** Cadastro ativo. Só o administrador desativa; a empresa desativada não entra em licença nova. */
  ativa: boolean;
  /** A titular (operadora, concessionária, construtora) executa obra ou serviço por conta própria.
   *  Habilita a licença com a mesma empresa como contratante e executora. Terceirizada não usa. */
  executa_obras: boolean;
  situacao: Situacao;
  processo_numero: string | null;
  data_requerimento: string | null;
  portaria_numero: string | null;
  portaria_data: string | null;
  validade_ate: string | null;
  notificacao_data: string | null;
  /** Caminho do logo no bucket público `logos`. */
  logo_arquivo: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Dados cadastrais editáveis no formulário da empresa. */
export type EmpresaInput = Pick<Empresa,
  'cnpj' | 'razao_social' | 'nome_fantasia' | 'tipo' | 'setores' | 'email' | 'telefone' | 'cep' | 'logradouro'
  | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'representante' | 'observacoes' | 'executa_obras'>;

/** Dados da inscrição, alterados pela SECONSER. */
export type InscricaoInput = Pick<Empresa,
  'situacao' | 'processo_numero' | 'data_requerimento' | 'portaria_numero' | 'portaria_data' | 'notificacao_data'>;

/** Terceirizada atendendo uma operadora. Vínculo encerrado tem `fim`. */
export interface Vinculo {
  id: string;
  /** Empresa que contrata (operadora, concessionária, construtora ou terceirizada). Nulo quando a contratante é um órgão público. */
  contratante_id: string | null;
  /** Órgão público contratante (ex.: SEMOB), alternativa à empresa. */
  orgao_contratante_id: string | null;
  /** Terceirizada contratada (subcontratada, se a contratante for terceirizada). */
  contratada_id: string;
  inicio: string;
  fim: string | null;
}

export interface TipoDocumento {
  codigo: string;
  nome: string;
  fundamento: string;
  obrigatorio: boolean;
  tem_validade: boolean;
  ordem: number;
  /** Perfis que entregam o documento (telecom, gás, saneamento, construtora, terceirizada). */
  perfis?: Perfil[];
}

export interface Documento {
  id: string;
  empresa_id: string;
  tipo: string;
  /** Arquivo no Storage; nulo quando a SECONSER só registra a entrega. */
  arquivo: string | null;
  nome_arquivo: string | null;
  validade: string | null;
  status: 'pendente' | 'entregue';
  enviado_em: string;
}

export const TIPO_LABEL: Record<Tipo, string> = {
  operadora: 'Operadora',
  concessionaria: 'Concessionária',
  construtora: 'Construtora',
  terceirizada: 'Terceirizada',
};

export const SETOR_LABEL: Record<Setor, string> = {
  telecom: 'Telecomunicações',
  gas: 'Gás',
  saneamento: 'Saneamento',
  drenagem: 'Drenagem',
  construcao: 'Construção civil',
  viario: 'Viário / mobilidade',
};

export const SETORES = Object.keys(SETOR_LABEL) as Setor[];

/** Quem contrata (operadora, concessionária, construtora), em oposição à terceirizada. */
export const ehContratante = (t: Tipo) => t !== 'terceirizada';

/** Descrição curta: "Concessionária de gás", "Terceirizada: gás, drenagem"… */
export function descricaoEmpresa(e: Pick<Empresa, 'tipo' | 'setores'>): string {
  const setores = e.setores.map((s) => SETOR_LABEL[s].toLowerCase());
  switch (e.tipo) {
    case 'operadora': return 'Operadora de telecomunicações';
    case 'concessionaria': return `Concessionária de ${setores[0] ?? ''}`.trim();
    case 'construtora': return 'Construtora';
    default: return setores.length ? `Terceirizada: ${setores.join(', ')}` : 'Terceirizada';
  }
}

/** Mesma regra de perfil_documental no banco. */
export function perfilDocumental(e: Pick<Empresa, 'tipo' | 'setores'>): Perfil {
  if (e.tipo === 'operadora') return 'telecom';
  if (e.tipo === 'concessionaria') return (e.setores[0] as Perfil) ?? 'gas';
  return e.tipo;
}

/** Documentos exigidos desta empresa. */
export const tiposDaEmpresa = (tipos: TipoDocumento[], e: Pick<Empresa, 'tipo' | 'setores'>) =>
  tipos.filter((t) => !t.perfis || t.perfis.includes(perfilDocumental(e)));

/** Mesma regra de empresa_atua_no_setor no banco. */
export const atuaNoSetor = (e: Pick<Empresa, 'tipo' | 'setores'>, s: Setor) =>
  e.tipo === 'construtora' ? s === 'construcao' || s === 'drenagem' : e.setores.includes(s);

export const SITUACAO_LABEL: Record<SituacaoEfetiva, string> = {
  em_analise: 'EM ANÁLISE',
  deferida: 'DEFERIDA',
  apta: 'APTA',
  em_saneamento: 'APTA – EM SANEAMENTO',
  inapta: 'INAPTA',
  vencida: 'VENCIDA',
};

/**
 * Opções dos filtros de situação nas listas. APTA reúne quem está em
 * saneamento, que continua apta até a inaptidão (art. 8º). Inapta só
 * aparece com "qualquer situação".
 */
export const FILTRO_SITUACAO: { valor: string; rotulo: string; inclui: SituacaoEfetiva[] }[] = [
  { valor: 'em_analise', rotulo: 'EM ANÁLISE', inclui: ['em_analise'] },
  { valor: 'deferida', rotulo: 'DEFERIDA', inclui: ['deferida'] },
  { valor: 'apta', rotulo: 'APTA', inclui: ['apta', 'em_saneamento'] },
  { valor: 'vencida', rotulo: 'VENCIDA', inclui: ['vencida'] },
];

/** Situações abrangidas pelo filtro escolhido; filtro vazio abrange todas. */
export function situacoesDoFiltro(filtro: string): SituacaoEfetiva[] {
  if (!filtro) return Object.keys(SITUACAO_LABEL) as SituacaoEfetiva[];
  return FILTRO_SITUACAO.find((f) => f.valor === filtro)?.inclui ?? [];
}

/** Mesma regra de `situacao_efetiva` no banco. */
export function situacaoEfetiva(
  e: Pick<Empresa, 'situacao' | 'validade_ate'>, hoje: string,
): SituacaoEfetiva {
  if ((e.situacao === 'apta' || e.situacao === 'em_saneamento') && e.validade_ate && e.validade_ate < hoje) {
    return 'vencida';
  }
  return e.situacao;
}

/** Pode atuar (art. 3º): deferida/apta (inclui saneamento, que segue apta). */
export const podeAtuar = (s: SituacaoEfetiva) =>
  s === 'deferida' || s === 'apta' || s === 'em_saneamento';

export const nomeEmpresa = (e: Pick<Empresa, 'razao_social' | 'nome_fantasia'>) =>
  e.nome_fantasia?.trim() || e.razao_social;

/**
 * Rótulo da contratante de um vínculo: empresa cadastrada ou órgão público
 * (a contratante pode ser qualquer um dos dois). Devolve nulo quando a
 * referência não está nos mapas. `fmtEmpresa` ajusta o formato do nome da
 * empresa (com ou sem código CADEX); o órgão sai sempre como `nomeOrgao`.
 */
export function rotuloContratante(
  v: Pick<Vinculo, 'contratante_id' | 'orgao_contratante_id'>,
  empresasPorId: Map<string, Empresa>,
  orgaosPorId: Map<string, Orgao>,
  fmtEmpresa: (e: Empresa) => string = (e) => `${nomeEmpresa(e)} (${e.codigo_cadex})`,
): string | null {
  if (v.contratante_id) {
    const e = empresasPorId.get(v.contratante_id);
    return e ? fmtEmpresa(e) : null;
  }
  if (v.orgao_contratante_id) {
    const o = orgaosPorId.get(v.orgao_contratante_id);
    return o ? nomeOrgao(o) : null;
  }
  return null;
}

// ---------------------------------------------------------------------
// Situação de cada documento
// ---------------------------------------------------------------------

/** Antecedência do aviso de vencimento. */
export const DIAS_AVISO = 30;

export type EstadoDocumento = 'pendente' | 'ok' | 'vence_em_breve' | 'vencido';

export const ESTADO_LABEL: Record<EstadoDocumento, string> = {
  pendente: 'Pendente',
  ok: 'Em dia',
  vence_em_breve: 'Vence em breve',
  vencido: 'Vencido',
};

/** Datas `YYYY-MM-DD` comparadas como texto: sem fuso horário no meio. */
export function estadoDocumento(
  tipo: Pick<TipoDocumento, 'tem_validade'>,
  doc: Pick<Documento, 'validade' | 'status'> | undefined,
  hoje: string,
): EstadoDocumento {
  if (!doc || doc.status === 'pendente') return 'pendente';
  if (!tipo.tem_validade || !doc.validade) return 'ok';
  if (doc.validade < hoje) return 'vencido';
  return doc.validade <= somaDias(hoje, DIAS_AVISO) ? 'vence_em_breve' : 'ok';
}

export function hojeISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function somaDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return hojeISO(new Date(y, m - 1, d + dias));
}

/** O documento vigente de cada tipo é o último enviado. */
export function ultimoPorTipo(docs: Documento[]): Map<string, Documento> {
  const m = new Map<string, Documento>();
  for (const d of docs) {
    const atual = m.get(d.tipo);
    if (!atual || d.enviado_em > atual.enviado_em) m.set(d.tipo, d);
  }
  return m;
}

export interface Resumo { faltando: number; vencidos: number; vencendo: number }

/** Quantos obrigatórios faltam e quantos documentos estão vencidos ou vencendo. */
export function resumoDocumentos(
  tipos: TipoDocumento[], docs: Documento[], hoje: string,
): Resumo {
  const ultimos = ultimoPorTipo(docs);
  const r: Resumo = { faltando: 0, vencidos: 0, vencendo: 0 };
  for (const t of tipos) {
    const e = estadoDocumento(t, ultimos.get(t.codigo), hoje);
    if (e === 'pendente' && t.obrigatorio) r.faltando++;
    if (e === 'vencido') r.vencidos++;
    if (e === 'vence_em_breve') r.vencendo++;
  }
  return r;
}

// ---------------------------------------------------------------------
// Acesso ao banco
// ---------------------------------------------------------------------

export async function listarEmpresas(): Promise<Empresa[]> {
  const { data, error } = await supabase.from('empresas').select('*').order('razao_social');
  if (error) throw error;
  return data as Empresa[];
}

export async function buscarEmpresa(id: string): Promise<Empresa> {
  const { data, error } = await supabase.from('empresas').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Empresa;
}

const limpar = (input: EmpresaInput) => {
  const vazioViraNulo = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    ...input,
    cnpj: onlyDigits(input.cnpj),
    razao_social: input.razao_social.trim(),
    email: input.email.trim(),
    nome_fantasia: vazioViraNulo(input.nome_fantasia),
    telefone: vazioViraNulo(input.telefone),
    cep: vazioViraNulo(input.cep),
    logradouro: vazioViraNulo(input.logradouro),
    numero: vazioViraNulo(input.numero),
    complemento: vazioViraNulo(input.complemento),
    bairro: vazioViraNulo(input.bairro),
    cidade: vazioViraNulo(input.cidade),
    uf: vazioViraNulo(input.uf)?.toUpperCase() ?? null,
    representante: vazioViraNulo(input.representante),
    observacoes: vazioViraNulo(input.observacoes),
  };
};

/** Cadastra a empresa e, se for terceirizada, os vínculos com quem a contratou. */
export async function criarEmpresa(input: EmpresaInput, contratantes: string[] = []): Promise<string> {
  const { data, error } = await supabase.from('empresas').insert(limpar(input)).select('id').single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  if (input.tipo === 'terceirizada' && contratantes.length > 0) {
    const v = await supabase.from('vinculos')
      .insert(contratantes.map((contratante_id) => ({ contratante_id, contratada_id: id })));
    if (v.error) throw v.error;
  }
  return id;
}

export async function salvarEmpresa(id: string, input: EmpresaInput): Promise<void> {
  // CNPJ e tipo não mudam depois do cadastro: o tipo está no código CADEX.
  const { cnpj: _cnpj, tipo: _tipo, ...resto } = limpar(input);
  const { error } = await supabase.from('empresas').update(resto).eq('id', id);
  if (error) throw error;
}

/**
 * Ativa ou desativa o cadastro de uma empresa. Só o administrador consegue: o banco recusa os
 * demais. A empresa desativada não entra em licença nova; o que já existe não muda.
 */
export async function definirEmpresaAtiva(id: string, ativa: boolean): Promise<void> {
  const { error } = await supabase.from('empresas').update({ ativa }).eq('id', id);
  if (error) throw error;
}

/**
 * O que a administração pode fazer com um cadastro. Desativar é para empresa
 * habilitada; empresa em análise sai pela exclusão. Excluir nunca vale se a
 * empresa tem licença: esses registros são históricos e públicos.
 */
export function opcoesCadastro(e: Pick<Empresa, 'ativa' | 'situacao'>, licencas: number) {
  const emAnalise = e.situacao === 'em_analise';
  return {
    // Em análise sem licença sai pela exclusão; com licença, só dá para desativar.
    desativar: e.ativa && (!emAnalise || licencas > 0),
    reativar: !e.ativa,
    excluir: (!e.ativa || emAnalise) && licencas === 0,
    /** Só para explicar, na tela, por que a exclusão não aparece. */
    motivoSemExclusao: licencas > 0 ? 'Tem licença: só dá para desativar.' : null,
  };
}

/**
 * Exclui o cadastro e os arquivos dele. O banco confere as regras e apaga a
 * linha primeiro; só depois os arquivos saem do Storage. Se o banco recusar,
 * nada é removido.
 */
export async function excluirEmpresa(e: Pick<Empresa, 'id' | 'logo_arquivo'>): Promise<void> {
  const { data: docs, error: erroDocs } = await supabase.from('documentos').select('arquivo').eq('empresa_id', e.id);
  if (erroDocs) throw erroDocs;
  const { error } = await supabase.rpc('admin_excluir_empresa', { p_id: e.id });
  if (error) throw error;
  const arquivos = (docs ?? []).map((d) => d.arquivo as string | null).filter((a): a is string => Boolean(a));
  if (arquivos.length) {
    const r = await supabase.storage.from(BUCKET).remove(arquivos);
    if (r.error) throw new Error('Cadastro excluído, mas alguns arquivos não foram removidos do armazenamento.');
  }
  if (e.logo_arquivo) {
    const r = await supabase.storage.from(BUCKET_LOGOS).remove([e.logo_arquivo]);
    if (r.error) throw new Error('Cadastro excluído, mas o logo não foi removido do armazenamento.');
  }
}

export async function listarVinculos(): Promise<Vinculo[]> {
  const { data, error } = await supabase.from('vinculos').select('*').order('inicio');
  if (error) throw error;
  return data as Vinculo[];
}

export async function criarVinculo(contratanteId: string, contratadaId: string): Promise<void> {
  const { error } = await supabase.from('vinculos')
    .insert({ contratante_id: contratanteId, contratada_id: contratadaId });
  if (error) throw error;
}

/** Vínculo com um órgão público como contratante (ex.: SEMOB contrata a terceirizada). */
export async function criarVinculoOrgao(orgaoId: string, contratadaId: string): Promise<void> {
  const { error } = await supabase.from('vinculos')
    .insert({ orgao_contratante_id: orgaoId, contratada_id: contratadaId });
  if (error) throw error;
}

/** Encerra (data de hoje) ou reabre um vínculo, sem apagar o histórico. */
export async function definirFimVinculo(id: string, fim: string | null): Promise<void> {
  const { error } = await supabase.from('vinculos').update({ fim }).eq('id', id);
  if (error) throw error;
}

export async function listarTiposDocumento(): Promise<TipoDocumento[]> {
  const { data, error } = await supabase.from('tipos_documento').select('*').order('ordem');
  if (error) throw error;
  return data as TipoDocumento[];
}

export async function listarDocumentos(empresaId?: string): Promise<Documento[]> {
  let q = supabase.from('documentos').select('*').order('enviado_em', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) throw error;
  return data as Documento[];
}

export async function enviarDocumento(
  empresaId: string, tipo: string, arquivo: File, validade: string | null,
): Promise<void> {
  const nomeSeguro = arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
  const caminho = `${empresaId}/${tipo}-${Date.now()}-${nomeSeguro}`;
  const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type || undefined,
  });
  if (up.error) throw up.error;

  const { error } = await supabase.from('documentos').insert({
    empresa_id: empresaId, tipo, arquivo: caminho, nome_arquivo: arquivo.name, validade,
  });
  if (error) {
    // Sem o registro, o arquivo ficaria órfão no Storage.
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw error;
  }
}

export async function removerDocumento(doc: Documento): Promise<void> {
  const { error } = await supabase.from('documentos').delete().eq('id', doc.id);
  if (error) throw error;
  if (doc.arquivo) await supabase.storage.from(BUCKET).remove([doc.arquivo]);
}

export interface MarcacaoDocumento {
  tipo: string;
  status: 'pendente' | 'entregue';
  validade: string | null;
}

/**
 * Registra a entrega (ou a volta a pendente) de vários documentos de uma
 * vez. Cada marcação é um registro novo: vale o mais recente, e os
 * anteriores ficam como histórico.
 */
export async function registrarDocumentos(empresaId: string, marcacoes: MarcacaoDocumento[]): Promise<void> {
  if (marcacoes.length === 0) return;
  const { error } = await supabase.from('documentos').insert(
    marcacoes.map((m) => ({
      empresa_id: empresaId, tipo: m.tipo, status: m.status,
      validade: m.status === 'entregue' ? m.validade : null,
    })),
  );
  if (error) throw error;
}

export async function linkDocumento(doc: Documento): Promise<string> {
  if (!doc.arquivo) throw new Error('Este documento foi registrado sem arquivo.');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.arquivo, 120);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------
// Logo (bucket público)
// ---------------------------------------------------------------------

export const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const urlLogo = (caminho: string) =>
  supabase.storage.from(BUCKET_LOGOS).getPublicUrl(caminho).data.publicUrl;

/** Envia o logo novo e só depois apaga o anterior. Nome novo a cada troca: sem cache velho. */
export async function enviarLogo(empresa: Pick<Empresa, 'id' | 'logo_arquivo'>, arquivo: File): Promise<void> {
  if (!TIPOS_LOGO.includes(arquivo.type)) throw new Error('Use PNG, JPG ou WebP.');
  if (arquivo.size > MAX_LOGO_BYTES) throw new Error('Logo acima de 2 MB.');
  const ext = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
  const caminho = `${empresa.id}/logo-${Date.now()}.${ext}`;
  const up = await supabase.storage.from(BUCKET_LOGOS).upload(caminho, arquivo, { contentType: arquivo.type });
  if (up.error) throw up.error;
  const { error } = await supabase.from('empresas').update({ logo_arquivo: caminho }).eq('id', empresa.id);
  if (error) {
    await supabase.storage.from(BUCKET_LOGOS).remove([caminho]);
    throw error;
  }
  if (empresa.logo_arquivo) await supabase.storage.from(BUCKET_LOGOS).remove([empresa.logo_arquivo]);
}

export async function removerLogo(empresa: Pick<Empresa, 'id' | 'logo_arquivo'>): Promise<void> {
  const { error } = await supabase.from('empresas').update({ logo_arquivo: null }).eq('id', empresa.id);
  if (error) throw error;
  if (empresa.logo_arquivo) await supabase.storage.from(BUCKET_LOGOS).remove([empresa.logo_arquivo]);
}

// ---------------------------------------------------------------------
// Inscrição e histórico
// ---------------------------------------------------------------------

export async function salvarInscricao(id: string, input: InscricaoInput): Promise<void> {
  const nulo = (v: string | null) => (v && v.trim() ? v.trim() : null);
  const { error } = await supabase.from('empresas').update({
    situacao: input.situacao,
    processo_numero: nulo(input.processo_numero),
    data_requerimento: nulo(input.data_requerimento),
    portaria_numero: nulo(input.portaria_numero),
    portaria_data: nulo(input.portaria_data),
    notificacao_data: nulo(input.notificacao_data),
  }).eq('id', id);
  if (error) throw error;
}

export interface Historico {
  id: string;
  de: Situacao | null;
  para: Situacao;
  portaria_numero: string | null;
  portaria_data: string | null;
  em: string;
}

export async function listarHistorico(empresaId: string): Promise<Historico[]> {
  const { data, error } = await supabase.from('historico_situacao').select('*')
    .eq('empresa_id', empresaId).order('em', { ascending: false });
  if (error) throw error;
  return data as Historico[];
}

// ---------------------------------------------------------------------
// Responsáveis técnicos, pessoal e veículos: listas da empresa
// ---------------------------------------------------------------------

export type Tabela = 'responsaveis_tecnicos' | 'funcionarios' | 'veiculos';
export type Registro = Record<string, string | boolean | null> & { id: string; ativo: boolean };

export async function listarDaEmpresa(tabela: Tabela, empresaId: string): Promise<Registro[]> {
  const { data, error } = await supabase.from(tabela).select('*')
    .eq('empresa_id', empresaId).order('criado_em');
  if (error) throw error;
  return data as Registro[];
}

/** Responsável técnico, só os campos da relação oficial (nome + conselho). */
export interface RtResumo {
  empresa_id: string;
  nome: string;
  conselho: string;
  registro_numero: string;
  registro_uf: string | null;
}

/** "Fulano (CREA-RJ 12345)" — nome e registro no conselho, para a relação. */
export const rotuloRt = (r: RtResumo) =>
  `${r.nome} (${[r.conselho, r.registro_uf].filter(Boolean).join('-')} ${r.registro_numero})`;

/** Todos os responsáveis técnicos ativos, para montar a coluna da exportação. */
export async function listarResponsaveis(): Promise<RtResumo[]> {
  const { data, error } = await supabase.from('responsaveis_tecnicos')
    .select('empresa_id, nome, conselho, registro_numero, registro_uf')
    .eq('ativo', true).order('nome');
  if (error) throw error;
  return (data ?? []) as RtResumo[];
}

export async function salvarDaEmpresa(
  tabela: Tabela, empresaId: string, valores: Record<string, unknown>, id?: string,
): Promise<void> {
  const { error } = id
    ? await supabase.from(tabela).update(valores).eq('id', id)
    : await supabase.from(tabela).insert({ ...valores, empresa_id: empresaId });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Consulta pública (art. 7º, § 2º): sem login
// ---------------------------------------------------------------------

export interface LinhaPublica {
  codigo_cadex: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  tipo: Tipo;
  setores: Setor[];
  situacao: SituacaoEfetiva;
  validade_ate: string | null;
  portaria_numero: string | null;
  portaria_data: string | null;
  contratantes: string[];
  logo_arquivo: string | null;
}

export async function consultaPublica(): Promise<LinhaPublica[]> {
  const { data, error } = await supabase.rpc('consulta_publica');
  if (error) throw error;
  return data as LinhaPublica[];
}
