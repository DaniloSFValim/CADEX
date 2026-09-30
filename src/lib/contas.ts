import { supabase } from './supabase';
import type { Papel } from './auth';

export interface Conta {
  user_id: string;
  email: string;
  /** null: a conta de login existe, mas não tem acesso ao CADEX. */
  nome: string | null;
  papel: Papel | null;
  administrador: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
}

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

export async function removerAcesso(userId: string) {
  const { error } = await supabase.rpc('admin_remover_acesso', { p_user_id: userId });
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

/** Senha provisória legível para ditar ou copiar: sem 0/O, 1/l/I. */
export function gerarSenhaProvisoria(tamanho = 12): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(tamanho));
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}
