/**
 * Encerramento automático da sessão (computador esquecido aberto).
 *
 * Roda no navegador: protege contra o uso por quem senta à máquina, não
 * contra sessão roubada (isso exige limite no servidor do Supabase).
 *
 *  - inatividade: sem uso por 30 min, encerra (aviso 60 s antes);
 *  - limite absoluto: 12 h depois do login com senha, pede login de novo.
 *
 * A última atividade fica no localStorage, compartilhada entre abas: usar
 * o CADEX em uma aba mantém as outras abertas.
 */
export const INATIVIDADE_MS = 30 * 60 * 1000;
export const LIMITE_ABSOLUTO_MS = 12 * 60 * 60 * 1000;
export const AVISO_MS = 60 * 1000;

export const CHAVE_ATIVIDADE = 'cadex:ultima-atividade';
export const CHAVE_MOTIVO = 'cadex:motivo-saida';

export type Motivo = 'inatividade' | 'limite';

export type EstadoSessao =
  | { tipo: 'ativa' }
  | { tipo: 'aviso'; motivo: Motivo; restanteMs: number }
  | { tipo: 'expirada'; motivo: Motivo };

/**
 * @param ultimaAtividade última interação registrada (ms), ou null
 * @param login momento do login com senha (ms), ou null se desconhecido
 */
export function estadoSessao(agora: number, ultimaAtividade: number | null, login: number | null): EstadoSessao {
  // Atividade anterior ao login não conta: quem acabou de entrar está ativo.
  const atividade = Math.max(ultimaAtividade ?? 0, login ?? 0) || agora;
  const fins: [Motivo, number][] = [['inatividade', atividade + INATIVIDADE_MS]];
  if (login) fins.push(['limite', login + LIMITE_ABSOLUTO_MS]);
  const [motivo, fim] = fins.reduce((a, b) => (b[1] < a[1] ? b : a));
  const restanteMs = fim - agora;
  if (restanteMs <= 0) return { tipo: 'expirada', motivo };
  if (restanteMs <= AVISO_MS) return { tipo: 'aviso', motivo, restanteMs };
  return { tipo: 'ativa' };
}

export const MENSAGEM_SAIDA: Record<Motivo, string> = {
  inatividade: 'Sua sessão foi encerrada depois de 30 minutos sem uso. Entre de novo para continuar.',
  limite: 'Por segurança, a sessão vale 12 horas a partir do login. Entre de novo para continuar.',
};

function ler(chave: string, armazenamento: Storage): string | null {
  try { return armazenamento.getItem(chave); } catch { return null; }
}
function gravar(chave: string, valor: string | null, armazenamento: Storage) {
  try {
    if (valor === null) armazenamento.removeItem(chave); else armazenamento.setItem(chave, valor);
  } catch { /* armazenamento bloqueado: segue sem */ }
}

export const lerAtividade = () => Number(ler(CHAVE_ATIVIDADE, localStorage)) || null;
export const registrarAtividade = (agora = Date.now()) => gravar(CHAVE_ATIVIDADE, String(agora), localStorage);
export const limparAtividade = () => gravar(CHAVE_ATIVIDADE, null, localStorage);

/** Motivo da última saída automática, mostrado na tela de login. */
export const guardarMotivo = (m: Motivo) => gravar(CHAVE_MOTIVO, m, sessionStorage);
export function lerMotivo(): Motivo | null {
  const m = ler(CHAVE_MOTIVO, sessionStorage);
  return m === 'inatividade' || m === 'limite' ? m : null;
}
export const limparMotivo = () => gravar(CHAVE_MOTIVO, null, sessionStorage);
