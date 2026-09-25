import type { ReactNode } from 'react';

export type Tom = 'neutro' | 'bom' | 'alerta' | 'ruim';

const TOM: Record<Tom, string> = {
  neutro: 'bg-slate-100 text-slate-700 ring-slate-300',
  bom: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  alerta: 'bg-amber-50 text-amber-900 ring-amber-300',
  ruim: 'bg-red-50 text-red-800 ring-red-300',
};

export function Badge({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TOM[tom]}`}>
      {children}
    </span>
  );
}

export function Card({
  title, action, children,
}: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({
  children, variant = 'primary', ...rest
}: { variant?: 'primary' | 'secondary' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: 'bg-marca-700 text-white hover:bg-marca-800',
    secondary: 'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50',
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium
        transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label, hint, children, required, className = '',
}: { label: string; hint?: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={`block ${className}`}>
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
  'placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-marca-600 sm:text-sm ' +
  'disabled:bg-slate-100 disabled:text-slate-500';

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

/** Erros do Supabase são objetos com `message`, não `Error`. */
export function errorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const msg = typeof e.message === 'string' ? e.message : '';
    if (e.code === '23505' || msg.includes('empresas_cnpj_key')) {
      return 'Já existe uma empresa cadastrada com este CNPJ.';
    }
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return 'Erro inesperado.';
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
  return <p className="px-4 py-8 text-center text-sm text-slate-500" aria-live="polite">{label}</p>;
}
