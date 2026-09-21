import type { ReactNode } from 'react';
import { STATUS_LABEL, statusTone, type StatusTone } from '../lib/rules';

const TONE: Record<StatusTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-300',
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  warn: 'bg-amber-50 text-amber-900 ring-amber-300',
  bad: 'bg-red-50 text-red-800 ring-red-300',
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[statusTone(status)]}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Card({
  title, action, children, className = '',
}: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Metric({
  label, value, tone = 'neutral', hint,
}: { label: string; value: ReactNode; tone?: StatusTone; hint?: string }) {
  const color =
    tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700'
    : tone === 'good' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Button({
  children, variant = 'primary', ...rest
}: { variant?: 'primary' | 'secondary' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: 'bg-gov-700 text-white hover:bg-gov-800 focus-visible:outline-gov-700',
    secondary: 'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    danger: 'bg-red-700 text-white hover:bg-red-800',
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium
        transition disabled:cursor-not-allowed disabled:opacity-50
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${styles} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label, hint, children, required,
}: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-md border-0 px-3 py-2 text-slate-900 ring-1 ring-inset ring-slate-300 ' +
  'placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-gov-600 sm:text-sm';

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

/**
 * O erro do PostgREST não é uma `Error`: é um objeto com `message`,
 * `details`, `hint` e `code`. A versão anterior caía em `String(error)` e
 * escrevia "[object Object]" na tela — ou seja, toda recusa do banco (que
 * é onde vivem as regras deste sistema) chegava ilegível ao usuário.
 */
export function errorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const parts = ['message', 'details', 'hint']
      .map((k) => (typeof e[k] === 'string' ? (e[k] as string).trim() : ''))
      .filter(Boolean);
    // `details` costuma repetir a `message`; não vale mostrar duas vezes.
    const unique = parts.filter((p, i) => parts.indexOf(p) === i);
    if (unique.length > 0) {
      const code = typeof e.code === 'string' ? ` (${e.code})` : '';
      return unique.join(' — ') + code;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'Erro sem descrição.';
    }
  }
  return String(error);
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">
      {errorMessage(error)}
    </p>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-slate-500" aria-live="polite">{label}</p>
  );
}
