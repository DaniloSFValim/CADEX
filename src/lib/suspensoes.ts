import { supabase } from './supabase';

/** Suspensão a pedido: início, fim (vazio enquanto durar) e motivo. Os dias suspensos não contam na validade. */
export interface Suspensao {
  id: string;
  licenca_id: string;
  inicio: string;
  fim: string | null;
  motivo: string;
  /** Suspensão é sempre determinada pela fiscalização; a origem diz quem pediu. */
  origem: OrigemSuspensao;
  criado_em: string;
}

export type OrigemSuspensao = 'pedido_da_empresa' | 'ato_proprio';

export const ORIGEM_SUSPENSAO_LABEL: Record<OrigemSuspensao, string> = {
  pedido_da_empresa: 'a pedido da empresa',
  ato_proprio: 'ato próprio da fiscalização',
};

/** Pedido de correção: pendência aberta até alguém registrar a resolução. Não muda a situação da licença. */
export interface PedidoCorrecao {
  id: string;
  licenca_id: string;
  motivo: string;
  pedido_em: string;
  resolucao: string | null;
  resolvido_em: string | null;
}

export async function listarSuspensoes(licencaId: string): Promise<Suspensao[]> {
  const { data, error } = await supabase.from('licenca_suspensoes').select('*')
    .eq('licenca_id', licencaId).order('inicio', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Suspensao[];
}

/** A suspensão ativa é a que ainda não tem data de fim. */
export const suspensaoAtiva = (lista: Suspensao[]) => lista.find((s) => s.fim === null) ?? null;

export async function suspenderLicenca(id: string, inicio: string, motivo: string, origem: OrigemSuspensao): Promise<void> {
  const { error } = await supabase.rpc('suspender_licenca', { p_id: id, p_inicio: inicio, p_motivo: motivo, p_origem: origem });
  if (error) throw error;
}

export async function retomarLicenca(id: string, fim: string): Promise<void> {
  const { error } = await supabase.rpc('retomar_licenca', { p_id: id, p_fim: fim });
  if (error) throw error;
}

export async function listarPedidosCorrecao(licencaId: string): Promise<PedidoCorrecao[]> {
  const { data, error } = await supabase.from('licenca_pedidos_correcao').select('*')
    .eq('licenca_id', licencaId).order('pedido_em', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PedidoCorrecao[];
}

export async function pedirCorrecao(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('pedir_correcao', { p_id: id, p_motivo: motivo });
  if (error) throw error;
}

export async function resolverCorrecao(pedidoId: string, resolucao: string): Promise<void> {
  const { error } = await supabase.rpc('resolver_correcao', { p_pedido: pedidoId, p_resolucao: resolucao });
  if (error) throw error;
}

/** Pedidos ainda abertos de todas as licenças, para o painel de pendências. */
export async function listarPedidosAbertos(): Promise<(PedidoCorrecao & { licencas: { numero: string | null; processo_sei: string } | null })[]> {
  const { data, error } = await supabase.from('licenca_pedidos_correcao')
    .select('*, licencas(numero, processo_sei)').is('resolvido_em', null).order('pedido_em', { ascending: true });
  if (error) throw error;
  return (data ?? []) as (PedidoCorrecao & { licencas: { numero: string | null; processo_sei: string } | null })[];
}

/** Dias corridos desde a abertura do pedido. */
export const diasAberto = (pedidoEm: string, hoje: string) =>
  Math.floor((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${pedidoEm.slice(0, 10)}T00:00:00Z`)) / 86400000);

/** Quantos pedidos de correção cada licença já teve, abertos ou resolvidos (para ver reincidência). */
export async function contarPedidosPorLicenca(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('licenca_pedidos_correcao').select('licenca_id');
  if (error) throw error;
  const contagem: Record<string, number> = {};
  for (const linha of (data ?? []) as { licenca_id: string }[]) contagem[linha.licenca_id] = (contagem[linha.licenca_id] ?? 0) + 1;
  return contagem;
}
