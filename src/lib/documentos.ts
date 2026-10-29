import { supabase } from './supabase';
import { SETOR_LABEL, SITUACAO_LABEL, TIPO_LABEL, type Empresa, type SituacaoEfetiva } from './empresas';

/**
 * Documentos oficiais da fiscalização de serviços concedidos. Cada tipo tem
 * layout e campos próprios. Do CADEX vem só o cadastro da empresa, que é
 * copiado para o documento no momento da emissão. O resto é digitado pelo
 * fiscal: o registro emitido não depende de cadastro que mude depois.
 */

export type TipoDocumento = 'notificacao' | 'auto_infracao' | 'embargo' | 'apreensao' | 'certidao_regularidade' | 'termo_compromisso';

export const TIPOS_DOCUMENTO: TipoDocumento[] = ['notificacao', 'auto_infracao', 'embargo', 'apreensao', 'certidao_regularidade', 'termo_compromisso'];

export const TITULO_DOCUMENTO: Record<TipoDocumento, string> = {
  notificacao: 'Auto de Notificação',
  auto_infracao: 'Auto de Infração',
  embargo: 'Auto de Embargo',
  apreensao: 'Auto de Apreensão',
  certidao_regularidade: 'Certidão de Regularidade',
  termo_compromisso: 'Termo de Compromisso e Responsabilidade',
};

export const RECEBIMENTO = [
  'Entregue ao autuado',
  'Recusou-se a assinar, receber ou não localizado',
  'Entregue via postal',
  'Testemunhas',
] as const;

export type TipoCampo = 'texto' | 'area' | 'data' | 'hora' | 'dinheiro' | 'selecao';

export interface CampoDocumento {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  opcoes?: readonly string[];
}

const CAMPO_LOCAL: CampoDocumento = { chave: 'local_infracao', rotulo: 'Local da infração', tipo: 'texto', obrigatorio: true };
const CAMPO_DATA: CampoDocumento = { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true };
const CAMPO_HORA: CampoDocumento = { chave: 'hora', rotulo: 'Hora', tipo: 'hora', obrigatorio: true };
const CAMPO_PROCESSO: CampoDocumento = { chave: 'processo', rotulo: 'Processo', tipo: 'texto', obrigatorio: true };
const CAMPO_LICENCA: CampoDocumento = { chave: 'licenca', rotulo: 'Licença nº', tipo: 'texto' };
const CAMPO_TERMO: CampoDocumento = { chave: 'termo_permissao', rotulo: 'Termo de permissão', tipo: 'texto' };
const CAMPO_ELEMENTOS: CampoDocumento = { chave: 'elementos', rotulo: 'Elementos de convicção e registros fotográficos', tipo: 'area' };
const CAMPO_FUNDAMENTO: CampoDocumento = { chave: 'fundamentacao', rotulo: 'Fundamentação legal', tipo: 'texto' };
const CAMPO_INFORMACOES: CampoDocumento = { chave: 'informacoes', rotulo: 'Informações complementares', tipo: 'area' };
const CAMPO_RECEBIMENTO: CampoDocumento = { chave: 'recebimento', rotulo: 'Recebimento', tipo: 'selecao', obrigatorio: true, opcoes: RECEBIMENTO };
const CAMPO_FISCAL: CampoDocumento[] = [
  { chave: 'fiscal_nome', rotulo: 'Fiscal autuante: nome', tipo: 'texto', obrigatorio: true },
  { chave: 'fiscal_matricula', rotulo: 'Fiscal autuante: matrícula', tipo: 'texto', obrigatorio: true },
];

/** Cabeçalho comum a notificação, auto de infração, embargo e apreensão. */
const CABECALHO_FISCALIZACAO: CampoDocumento[] = [CAMPO_LOCAL, CAMPO_DATA, CAMPO_HORA, CAMPO_PROCESSO, CAMPO_LICENCA, CAMPO_TERMO];

export const CAMPOS_DOCUMENTO: Record<TipoDocumento, CampoDocumento[]> = {
  notificacao: [
    ...CABECALHO_FISCALIZACAO,
    { chave: 'descricao', rotulo: 'Fatos verificados', tipo: 'area', obrigatorio: true },
    CAMPO_ELEMENTOS,
    { chave: 'exigencia', rotulo: 'Providência exigida', tipo: 'area', obrigatorio: true },
    { chave: 'prazo', rotulo: 'Prazo para cumprimento', tipo: 'texto', obrigatorio: true },
    CAMPO_FUNDAMENTO,
    CAMPO_INFORMACOES,
    CAMPO_RECEBIMENTO,
    ...CAMPO_FISCAL,
  ],
  auto_infracao: [
    ...CABECALHO_FISCALIZACAO,
    { chave: 'descricao', rotulo: 'Descrição da(s) infração(ões)', tipo: 'area', obrigatorio: true },
    CAMPO_ELEMENTOS,
    { chave: 'infringencia', rotulo: 'Infringência', tipo: 'texto', obrigatorio: true },
    { chave: 'sancao', rotulo: 'Sanção', tipo: 'texto', obrigatorio: true },
    { chave: 'valor', rotulo: 'Valor da multa (R$)', tipo: 'dinheiro', obrigatorio: true },
    { chave: 'prazo', rotulo: 'Prazo para pagamento', tipo: 'texto', obrigatorio: true },
    CAMPO_FUNDAMENTO,
    CAMPO_INFORMACOES,
    CAMPO_RECEBIMENTO,
    ...CAMPO_FISCAL,
  ],
  embargo: [
    ...CABECALHO_FISCALIZACAO,
    { chave: 'trecho', rotulo: 'Trecho ou área embargada', tipo: 'area', obrigatorio: true },
    { chave: 'motivo', rotulo: 'Motivo do embargo', tipo: 'area', obrigatorio: true },
    CAMPO_ELEMENTOS,
    { chave: 'prazo', rotulo: 'Prazo para cumprimento', tipo: 'texto', obrigatorio: true },
    CAMPO_FUNDAMENTO,
    CAMPO_INFORMACOES,
    CAMPO_RECEBIMENTO,
    ...CAMPO_FISCAL,
  ],
  apreensao: [
    ...CABECALHO_FISCALIZACAO,
    { chave: 'bens', rotulo: 'Bens apreendidos (descrição e quantidade)', tipo: 'area', obrigatorio: true },
    { chave: 'deposito', rotulo: 'Local de depósito', tipo: 'texto', obrigatorio: true },
    { chave: 'descricao', rotulo: 'Motivo da apreensão', tipo: 'area', obrigatorio: true },
    CAMPO_ELEMENTOS,
    { chave: 'prazo', rotulo: 'Prazo para retirada ou defesa', tipo: 'texto', obrigatorio: true },
    CAMPO_FUNDAMENTO,
    CAMPO_INFORMACOES,
    CAMPO_RECEBIMENTO,
    ...CAMPO_FISCAL,
  ],
  // Só a identificação do fiscal: o texto e os dados vêm do cadastro, para que a certidão não seja redigida à mão.
  certidao_regularidade: [
    { chave: 'fiscal_nome', rotulo: 'Fiscal responsável pela emissão: nome', tipo: 'texto', obrigatorio: true },
    { chave: 'fiscal_matricula', rotulo: 'Fiscal responsável pela emissão: matrícula', tipo: 'texto', obrigatorio: true },
  ],
  termo_compromisso: [
    { chave: 'local', rotulo: 'Local', tipo: 'texto', obrigatorio: true },
    { chave: 'data', rotulo: 'Data da assinatura', tipo: 'data', obrigatorio: true },
  ],
};

/**
 * Texto do termo. Cada parágrafo é um item. Os dados da empresa entram pelo
 * registro copiado do cadastro, não pelo texto.
 */
export const TEXTO_TERMO_COMPROMISSO = {
  compromisso: [
    'O representante legal da empresa identificada neste termo declara conhecer e comprometer-se a cumprir as regras do Cadastro de Executores (CADEX) da Prefeitura Municipal de Niterói, estabelecidas na Resolução Conjunta SECONSER/SEOP nº 001/2026 e nas orientações da Fiscalização de Serviços Concedidos.',
    'A empresa se compromete a comunicar à Fiscalização, sem demora, qualquer alteração dos dados registrados neste termo, e a manter atualizada a documentação exigida para a sua inscrição (art. 6º), ciente de que a perda de validade ou a falta de renovação de documento sujeita a inscrição a notificação para saneamento em 30 dias (art. 8º).',
    'O representante legal declara ciência das obrigações impostas pela Lei nº 3.988/2025 às concessionárias e demais entes autorizados a intervir em vias públicas, subsolo e espaço aéreo do Município (art. 6º), da fiscalização exercida pela SECONSER e das penalidades previstas no art. 13 da mesma lei, e de que a concessionária ou ente autorizado responde pelas penalidades decorrentes das infrações praticadas por suas contratadas (art. 15).',
  ],
  responsabilidade: [
    'O representante legal declara, sob as penas da lei, que as informações prestadas para o cadastro e para a inscrição no CADEX são verdadeiras, completas e atualizadas, e responde por elas, inclusive pelos documentos apresentados.',
    'Declara também que os documentos entregues são verdadeiros e correspondem aos originais, e que assume a responsabilidade pelo seu conteúdo perante a Prefeitura Municipal de Niterói.',
  ],
};

/** Registro da empresa copiado no momento da emissão do termo de compromisso. */
/** Responsável técnico ativo, como vai para o documento (sem CPF). */
export interface ResponsavelDoCadastro {
  nome: string;
  conselho: string;
  registro_numero: string;
  registro_uf: string | null;
  art_rrt_numero: string | null;
}

export interface RegistroDoCadastro extends AutuadoDoCadastro {
  codigo_cadex: string;
  responsaveis: ResponsavelDoCadastro[];
  tipo_empresa: string;
  setores: string[];
  email: string;
  representante: string;
  processo_numero: string | null;
  data_requerimento: string | null;
  portaria_numero: string | null;
  portaria_data: string | null;
  validade_ate: string | null;
}

export function registroDoCadastro(e: Empresa): RegistroDoCadastro {
  return {
    ...autuadoDoCadastro(e, SITUACAO_LABEL[e.situacao as SituacaoEfetiva] ?? e.situacao),
    codigo_cadex: e.codigo_cadex,
    responsaveis: [],
    tipo_empresa: TIPO_LABEL[e.tipo],
    setores: e.setores.map((s) => SETOR_LABEL[s]),
    email: e.email,
    representante: e.representante ?? '',
    processo_numero: e.processo_numero,
    data_requerimento: e.data_requerimento,
    portaria_numero: e.portaria_numero,
    portaria_data: e.portaria_data,
    validade_ate: e.validade_ate,
  };
}

/**
 * Texto da certidão de regularidade, montado com o registro copiado do cadastro.
 * Certifica só a situação cadastral (art. 3º: pode atuar) na data de emissão.
 */
export function textoCertidaoRegularidade(r: RegistroDoCadastro, emitidaEm: string): string[] {
  const data = (v: string | null) => (v ? v.split('-').reverse().join('/') : '—');
  return [
    `A Secretaria Municipal de Conservação e Serviços Públicos (SECONSER), por meio da Fiscalização de Serviços Concedidos, certifica que ${r.razao_social}, inscrita no CNPJ ${r.cnpj} sob o código CADEX ${r.codigo_cadex}, tem inscrição prévia e ativa no Cadastro de Executores (CADEX) do Município de Niterói, na situação ${r.situacao_cadastro}, na data de emissão desta certidão.`,
    `A inscrição consta do processo ${r.processo_numero ?? '—'}, com a portaria ${r.portaria_numero ?? '—'}, publicada em ${data(r.portaria_data)}, e tem validade até ${data(r.validade_ate)}, nos termos dos arts. 3º e 7º, § 1º, da Resolução Conjunta SECONSER/SEOP nº 001/2026.`,
    'Esta certidão comprova somente a situação cadastral da empresa. Não dispensa as autorizações exigidas para cada obra ou serviço, que seguem a Lei nº 3.988/2025 (art. 10).',
    `Emitida com base no cadastro vigente em ${data(emitidaEm.slice(0, 10))}. A autenticidade pode ser conferida pelo código de verificação impresso no rodapé.`,
  ];
}

/** Dados do autuado copiados do cadastro da empresa no momento da emissão. */
export interface AutuadoDoCadastro {
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  endereco: string;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  situacao_cadastro: string;
}

export function autuadoDoCadastro(e: Pick<Empresa, 'razao_social' | 'nome_fantasia' | 'cnpj' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'cep' | 'telefone'>, situacao: string): AutuadoDoCadastro {
  const endereco = [
    [e.logradouro, e.numero].filter(Boolean).join(', '),
    e.complemento,
    e.bairro,
  ].filter((p) => p && p.trim()).join(' - ');
  return {
    razao_social: e.razao_social,
    nome_fantasia: e.nome_fantasia,
    cnpj: e.cnpj,
    endereco,
    cidade: e.cidade,
    uf: e.uf,
    cep: e.cep,
    telefone: e.telefone,
    situacao_cadastro: situacao,
  };
}

export interface DocumentoOficial {
  id: string;
  tipo: TipoDocumento;
  numero: number;
  empresa_id: string;
  dados: Record<string, unknown>;
  emitido_por: string;
  emitido_em: string;
  codigo_verificacao: string;
}

/** Prefixo de cada tipo: cada documento tem a sua sequência de números. */
const PREFIXO_DOCUMENTO: Record<TipoDocumento, string> = {
  notificacao: 'NOT',
  auto_infracao: 'AI',
  embargo: 'EMB',
  apreensao: 'APR',
  certidao_regularidade: 'CER',
  termo_compromisso: 'TCR',
};

/** Ano da emissão no calendário de Brasília. */
function anoBrasilia(emitidoEm: string): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date(emitidoEm)));
}

/** "AI-007/2026 - SFSC", como no modelo da fiscalização. A sequência é por tipo; o ano é o da emissão. */
export function numeroDocumento(numero: number, tipo: TipoDocumento, emitidoEm: string): string {
  return `${PREFIXO_DOCUMENTO[tipo]}-${String(numero).padStart(3, '0')}/${anoBrasilia(emitidoEm)} - SFSC`;
}

/** Anos de validade de certidão e termo, contados da emissão. */
export const ANOS_VALIDADE_DOCUMENTO = 1;

/**
 * Último dia de validade de certidão e termo: um ano depois da emissão, no calendário de Brasília.
 * Em 29 de fevereiro, cai em 28 de fevereiro quando o ano seguinte não é bissexto.
 */
export function validadeDocumento(emitidoEm: string): string {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(emitidoEm)).split('-').map(Number);
  const anoFinal = ano + ANOS_VALIDADE_DOCUMENTO;
  const ultimoDia = new Date(Date.UTC(anoFinal, mes, 0)).getUTCDate();
  return `${anoFinal}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

/** Prazo de defesa ou recurso, impresso em todo auto (notificação, infração, embargo e apreensão). */
export const TEXTO_DEFESA_AUTO = 'Defesa ou recurso no prazo de 30 dias, contados do recebimento deste documento ou da sua publicação no Diário Oficial do Município, dirigidos à própria Fiscalização de Serviços Concedidos.';

/** Código de verificação em blocos de quatro, para ler e digitar. */
export function codigoLegivel(codigo: string): string {
  return codigo.match(/.{1,4}/g)?.join('-') ?? codigo;
}

/** Problemas que impedem a emissão. Lista vazia quando o documento pode sair. */
export function validarDados(tipo: TipoDocumento, dados: Record<string, string>): string[] {
  const erros: string[] = [];
  for (const campo of CAMPOS_DOCUMENTO[tipo]) {
    const valor = (dados[campo.chave] ?? '').trim();
    if (campo.obrigatorio && !valor) erros.push(`${campo.rotulo}: obrigatório.`);
    if (!valor) continue;
    if (campo.tipo === 'dinheiro') {
      const n = dinheiroParaNumero(valor);
      if (n === null || n <= 0) erros.push(`${campo.rotulo}: informe um valor maior que zero.`);
    }
    if (campo.tipo === 'data' && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) erros.push(`${campo.rotulo}: data inválida.`);
    if (campo.tipo === 'hora' && !/^\d{2}:\d{2}$/.test(valor)) erros.push(`${campo.rotulo}: hora inválida.`);
    if (campo.tipo === 'selecao' && campo.opcoes && !campo.opcoes.includes(valor as never)) {
      erros.push(`${campo.rotulo}: escolha uma das opções.`);
    }
  }
  return erros;
}

/** "13.043,58" ou "13043.58" -> 13043.58; inválido -> null. */
export function dinheiroParaNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/, '');
  let normalizado: string;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(limpo)) normalizado = limpo.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(\.\d{1,2})?$/.test(limpo)) normalizado = limpo;
  else return null;
  const n = Number(normalizado);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const UNIDADES = ['', 'UM', 'DOIS', 'TRÊS', 'QUATRO', 'CINCO', 'SEIS', 'SETE', 'OITO', 'NOVE', 'DEZ', 'ONZE', 'DOZE', 'TREZE',
  'QUATORZE', 'QUINZE', 'DEZESSEIS', 'DEZESSETE', 'DEZOITO', 'DEZENOVE'];
const DEZENAS = ['', '', 'VINTE', 'TRINTA', 'QUARENTA', 'CINQUENTA', 'SESSENTA', 'SETENTA', 'OITENTA', 'NOVENTA'];
const CENTENAS = ['', 'CENTO', 'DUZENTOS', 'TREZENTOS', 'QUATROCENTOS', 'QUINHENTOS', 'SEISCENTOS', 'SETECENTOS', 'OITOCENTOS', 'NOVECENTOS'];

/** Até 999 em palavras. "CENTO" é usado só quando não há centena cheia. */
function ateNovecentosNoventaNove(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CEM';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(DEZENAS[d]);
      if (u) partes.push(UNIDADES[u]);
    }
  }
  return partes.join(' E ');
}

/** Número inteiro até 999.999.999.999 em palavras, em maiúsculas. */
function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'ZERO';
  const grupos: [number, string, string][] = [
    [1_000_000_000, 'BILHÃO', 'BILHÕES'],
    [1_000_000, 'MILHÃO', 'MILHÕES'],
    [1_000, 'MIL', 'MIL'],
  ];
  const partes: string[] = [];
  let resto = n;
  for (const [valor, singular, plural] of grupos) {
    const q = Math.floor(resto / valor);
    resto %= valor;
    if (!q) continue;
    if (valor === 1_000) partes.push(q === 1 ? 'MIL' : `${ateNovecentosNoventaNove(q)} MIL`);
    else partes.push(q === 1 ? `UM ${singular}` : `${ateNovecentosNoventaNove(q)} ${plural}`);
  }
  if (resto) partes.push(ateNovecentosNoventaNove(resto));
  // Sem "E" entre milhar e centena, como no modelo da fiscalização.
  return partes.join(' ');
}

/** Valor da multa por extenso, como no modelo: "TREZE MIL ... REAIS E CINQUENTA E OITO CENTAVOS". */
export function valorPorExtenso(valor: number): string {
  const centavos = Math.round(valor * 100);
  const reais = Math.floor(centavos / 100);
  const cents = centavos % 100;
  const textoReais = reais === 1 ? 'UM REAL' : `${inteiroPorExtenso(reais)} REAIS`;
  if (cents === 0) return textoReais;
  const textoCentavos = cents === 1 ? 'UM CENTAVO' : `${inteiroPorExtenso(cents)} CENTAVOS`;
  return `${textoReais} E ${textoCentavos}`;
}

/** Data ISO (AAAA-MM-DD) para exibição (DD/MM/AAAA). */
export function dataExibicao(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Instante ISO para exibição no documento: DD/MM/AAAA às HH:MM (horário de Brasília). */
export function instanteExibicao(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return `${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')}`;
}

/** Monta o snapshot que vai para o banco: campos do fiscal + dados do autuado, sem campos vazios. */
export function montarDados(tipo: TipoDocumento, campos: Record<string, string>, autuado: AutuadoDoCadastro): Record<string, unknown> {
  const dados: Record<string, unknown> = { autuado };
  for (const campo of CAMPOS_DOCUMENTO[tipo]) {
    const valor = (campos[campo.chave] ?? '').trim();
    if (!valor) continue;
    if (campo.tipo === 'dinheiro') {
      const n = dinheiroParaNumero(valor);
      dados[campo.chave] = n;
      dados[`${campo.chave}_extenso`] = n === null ? null : valorPorExtenso(n);
    } else {
      dados[campo.chave] = valor;
    }
  }
  return dados;
}

export async function emitirDocumento(tipo: TipoDocumento, empresaId: string, dados: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('emitir_documento', {
    p_tipo: tipo, p_empresa_id: empresaId, p_dados: dados,
  });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) throw new Error('A emissão não devolveu o documento.');
  return linha as { id: string; numero: number; codigo_verificacao: string; emitido_em: string };
}

/** Responsáveis técnicos ativos da empresa, para copiar no documento. Sem CPF. */
export async function buscarResponsaveisAtivos(empresaId: string): Promise<ResponsavelDoCadastro[]> {
  const { data, error } = await supabase
    .from('responsaveis_tecnicos')
    .select('nome, conselho, registro_numero, registro_uf, art_rrt_numero')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as ResponsavelDoCadastro[];
}

export async function listarDocumentosDaEmpresa(empresaId: string): Promise<DocumentoOficial[]> {
  const { data, error } = await supabase
    .from('documentos_oficiais')
    .select('id, tipo, numero, empresa_id, dados, emitido_por, emitido_em, codigo_verificacao')
    .eq('empresa_id', empresaId)
    .order('emitido_em', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentoOficial[];
}

/** O que a verificação pública devolve sobre um documento emitido. */
export interface VerificacaoDocumento {
  tipo: TipoDocumento;
  numero: number;
  emitido_em: string;
  razao_social: string;
  codigo_cadex: string;
  situacao_atual: string;
  validade_ate: string | null;
}

/** Confere um documento pelo código impresso ou pelo QR Code. Null se não existe. */
export async function verificarDocumento(codigo: string): Promise<VerificacaoDocumento | null> {
  const { data, error } = await supabase.rpc('verificar_documento', { p_codigo: codigo });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha as VerificacaoDocumento | undefined) ?? null;
}
