/**
 * Regras computáveis espelhadas no cliente (§43).
 *
 * IMPORTANTE: estas funções existem para dar feedback imediato na
 * interface. Elas NÃO são o ponto de aplicação da regra — a aplicação
 * real é no banco (triggers e RLS em supabase/migrations). Um cliente
 * adulterado não consegue burlar nada.
 */

export type CadexStatus =
  | 'rascunho' | 'protocolado' | 'em_analise' | 'pendente' | 'deferido'
  | 'ativo' | 'proximo_vencimento' | 'inapto' | 'indeferido' | 'cancelado';

/** §43 Regra 1, 6 e 8. */
export function isCadexActive(status: CadexStatus, validUntil: string | null): boolean {
  if (status !== 'ativo' && status !== 'proximo_vencimento') return false;
  if (!validUntil) return false;
  return daysUntil(validUntil) >= 0;
}

export function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export type DocumentHealth = 'ok' | 'vencendo' | 'vencido' | 'sem_validade';

export function documentHealth(validUntil: string | null, warningDays = 30): DocumentHealth {
  if (!validUntil) return 'sem_validade';
  const d = daysUntil(validUntil);
  if (d < 0) return 'vencido';
  if (d <= warningDays) return 'vencendo';
  return 'ok';
}

/** §43 Regra 2: obra de infraestrutura exige licença prévia deferida. */
export function canStartWork(licenseStatus: string | null, validUntil: string | null): boolean {
  if (licenseStatus !== 'deferida') return false;
  if (validUntil && daysUntil(validUntil) < 0) return false;
  return true;
}

/** §43 Regra 5: emergência regularizada em até 24h (parametrizável). */
export function emergencyDeadline(calledAt: string, hours = 24): Date {
  return new Date(new Date(calledAt).getTime() + hours * 3_600_000);
}

export function isEmergencyLate(calledAt: string, regularizedAt: string | null, hours = 24): boolean {
  const due = emergencyDeadline(calledAt, hours);
  return (regularizedAt ? new Date(regularizedAt) : new Date()) > due;
}

/** Validação de CNPJ idêntica à do banco (cadex.is_valid_cnpj). */
export function isValidCnpj(input: string): boolean {
  const d = (input ?? '').replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const check = (len: number): number => {
    let pos = len - 7;
    let sum = 0;
    for (let i = len; i >= 1; i--) {
      sum += Number(d[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

export function formatCnpj(input: string): string {
  const d = (input ?? '').replace(/\D/g, '').padEnd(14, '_').slice(0, 14);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  protocolado: 'Protocolado',
  protocolada: 'Protocolada',
  em_analise: 'Em análise',
  em_diligencia: 'Em diligência',
  pendente: 'Pendente',
  deferido: 'Deferido',
  deferida: 'Deferida',
  ativo: 'Ativo',
  proximo_vencimento: 'Próximo do vencimento',
  inapto: 'Inapto',
  indeferido: 'Indeferido',
  indeferida: 'Indeferida',
  cancelado: 'Cancelado',
  cancelada: 'Cancelada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  vencida: 'Vencida',
  registrada: 'Registrada',
  equipe_em_deslocamento: 'Equipe em deslocamento',
  encerrada: 'Encerrada',
  acionada: 'Acionada',
  em_deslocamento: 'Em deslocamento',
  em_atendimento: 'Em atendimento',
  aguardando_regularizacao: 'Aguardando regularização',
  regularizada: 'Regularizada',
  fora_do_prazo: 'Fora do prazo',
};

export type StatusTone = 'neutral' | 'good' | 'warn' | 'bad';

export function statusTone(status: string): StatusTone {
  if (['ativo', 'deferido', 'deferida', 'regularizada', 'concluida', 'encerrada'].includes(status))
    return 'good';
  if (['proximo_vencimento', 'pendente', 'em_analise', 'em_diligencia', 'aguardando_regularizacao'].includes(status))
    return 'warn';
  if (['inapto', 'indeferido', 'indeferida', 'vencida', 'fora_do_prazo', 'cancelado', 'cancelada'].includes(status))
    return 'bad';
  return 'neutral';
}
