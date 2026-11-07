import { supabase } from './supabase';
import type { Papel } from './auth';

export interface Conta {
  user_id: string;
  email: string;
  /** null: a conta de login existe, mas não tem acesso ao CADEX. */
  nome: string | null;
  papel: Papel | null;
  administrador: boolean;
  /** Acesso ativo. Desativado, o servidor não entra nem lê nada, e o cadastro dele fica guardado. */
  ativo: boolean;
  matricula: string | null;
  cargo: string | null;
  criado_em: string;
  ultimo_acesso: string | null;
  /** Já cadastrou o aplicativo autenticador. */
  mfa_ativa: boolean;
}

/** Perfis de acesso e o que cada um faz no cadastro. Ser administrador acrescenta só a gestão de contas. */
export const PERFIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  { valor: 'gestor', rotulo: 'SECONSER', descricao: 'cadastra, altera e decide inscrições' },
  { valor: 'licenciador', rotulo: 'Licenciamento', descricao: 'só registra licenças de obra' },
  { valor: 'cisp', rotulo: 'CISP', descricao: 'só consulta, sem ver documentos' },
];

export const SENHA_MINIMA = 10;

export async function listarContas(): Promise<Conta[]> {
  const { data, error } = await supabase.rpc('admin_listar_contas');
  if (error) throw error;
  return (data ?? []) as Conta[];
}

export async function definirAcesso(userId: string, nome: string, papel: Papel, administrador: boolean) {
  const { error } = await supabase.rpc('admin_definir_acesso', {
    p_user_id: userId, p_nome: nome, p_papel: papel, p_administrador: administrador,
  });
  if (error) throw error;
}

/** Matrícula e cargo, que saem nos documentos emitidos. Exige que a conta já tenha acesso. */
export async function definirDadosFuncionais(userId: string, matricula: string, cargo: string) {
  const { error } = await supabase.rpc('admin_definir_dados_funcionais', {
    p_user_id: userId, p_matricula: matricula, p_cargo: cargo,
  });
  if (error) throw error;
}

/** Desativa ou reativa o acesso sem apagar nada. O banco recusa desativar o último administrador. */
export async function definirAtivo(userId: string, ativo: boolean) {
  const { error } = await supabase.rpc('admin_definir_ativo', { p_user_id: userId, p_ativo: ativo });
  if (error) throw error;
}

/** Chama a Edge Function, que usa a chave de serviço; a mensagem de erro vem no corpo. */
async function chamarAdmin(corpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-contas', { body: corpo });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { msg = (await ctx.json()).erro ?? msg; } catch { /* mantém a mensagem genérica */ }
    }
    throw new Error(msg);
  }
  return data as { ok: boolean; user_id?: string };
}

export function criarConta(p: { email: string; nome: string; papel: Papel; administrador: boolean; senha: string }) {
  return chamarAdmin({ acao: 'criar', ...p });
}

export function redefinirSenha(userId: string, senha: string) {
  return chamarAdmin({ acao: 'redefinir_senha', user_id: userId, senha });
}

export function zerarMfa(userId: string) {
  return chamarAdmin({ acao: 'zerar_mfa', user_id: userId });
}

/** Registros ligados à conta, para o administrador conferir antes de excluir. */
export interface VinculosDaConta {
  eventos_auditoria: number;
  documentos_enviados: number;
  mudancas_de_situacao: number;
  licencas_excluidas: number;
}

export async function vinculosDaConta(userId: string): Promise<VinculosDaConta> {
  const { data, error } = await supabase.rpc('admin_vinculos_da_conta', { p_user_id: userId });
  if (error) throw error;
  return data as VinculosDaConta;
}

/**
 * Exclui a conta: remove o acesso ao CADEX e apaga o login (credenciais e sessões). O histórico de
 * quem fez o quê continua na auditoria. O banco recusa a própria conta e o último administrador ativo.
 */
export function excluirConta(userId: string) {
  return chamarAdmin({ acao: 'excluir', user_id: userId });
}

/** Senha provisória legível para ditar ou copiar: sem 0/O, 1/l/I. */
export function gerarSenhaProvisoria(tamanho = 12): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(tamanho));
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}

/** Representante (ou operador) de uma empresa, com o nome da empresa para a lista. */
export interface Representante {
  user_id: string;
  empresa_id: string;
  papel: 'representante' | 'operador';
  ativo: boolean;
  nome: string;
  email: string;
  criado_em: string;
  desativado_em: string | null;
  empresas: { razao_social: string; codigo_cadex: string } | null;
}

export async function listarRepresentantes(): Promise<Representante[]> {
  const { data, error } = await supabase.from('empresa_usuarios')
    .select('user_id, empresa_id, papel, ativo, nome, email, criado_em, desativado_em, empresas(razao_social, codigo_cadex)')
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Representante[];
}

export function criarRepresentante(p: { empresa_id: string; nome: string; email: string; papel: Representante['papel']; senha: string }) {
  return chamarAdmin({ acao: 'criar_representante', ...p });
}

/** Desativa ou reativa um acesso de empresa. A regra do banco só deixa o gestor fazer isso. */
export async function definirRepresentanteAtivo(userId: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('empresa_usuarios')
    .update({ ativo, desativado_em: ativo ? null : new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
}
