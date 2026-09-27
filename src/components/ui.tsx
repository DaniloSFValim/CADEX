import type { ReactNode } from 'react';

export type Tom = 'neutro' | 'bom' | 'alerta' | 'ruim';

const TOM: Record<Tom, { caixa: string; ponto: string }> = {
  neutro: { caixa: 'bg-tinta-100 text-tinta-700', ponto: 'bg-tinta-400' },
  bom: { caixa: 'bg-emerald-50 text-emerald-800', ponto: 'bg-emerald-600' },
  alerta: { caixa: 'bg-amber-50 text-amber-900', ponto: 'bg-amber-500' },
  ruim: { caixa: 'bg-red-50 text-red-800', ponto: 'bg-red-600' },
};

export function Badge({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-2xs font-semibold tracking-wide ${TOM[tom].caixa}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TOM[tom].ponto}`} aria-hidden />
      {children}
    </span>
  );
}

export function Card({
  title, action, children, semPadding = false,
}: { title?: ReactNode; action?: ReactNode; children: ReactNode; semPadding?: boolean }) {
  return (
    <section className="rounded-md border border-tinta-200 bg-white">
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-tinta-200 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-tinta-900">{title}</h2>
          {action}
        </header>
      )}
      <div className={semPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

/** Título da página: trilha, título, descrição e ações à direita. */
export function Titulo({
  trilha, titulo, descricao, acoes, children,
}: { trilha?: ReactNode; titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {trilha && <div className="mb-1.5 text-xs text-tinta-500">{trilha}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-tinta-900">{titulo}</h1>
        {descricao && <div className="mt-1 text-sm text-tinta-500">{descricao}</div>}
        {children}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function Button({
  children, variant = 'primary', ...rest
}: { variant?: 'primary' | 'secondary' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: 'bg-marca-700 text-white hover:bg-marca-800',
    secondary: 'bg-white text-tinta-700 ring-1 ring-inset ring-tinta-300 hover:bg-tinta-50',
    danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50',
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 text-sm font-medium
        transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** Mesmo visual dos botões, para links (react-router). */
export const botaoLink = {
  primary: 'inline-flex items-center justify-center gap-2 rounded bg-marca-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-800',
  secondary: 'inline-flex items-center justify-center gap-2 rounded bg-white px-3.5 py-2 text-sm font-medium text-tinta-700 ring-1 ring-inset ring-tinta-300 transition-colors hover:bg-tinta-50',
};

export function Field({
  label, hint, children, required, className = '',
}: { label: string; hint?: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[13px] font-medium text-tinta-700">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-tinta-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'block w-full rounded border border-tinta-300 bg-white px-3 py-2 text-sm text-tinta-900 ' +
  'placeholder:text-tinta-400 focus:border-marca-600 focus:outline-none focus:ring-2 focus:ring-marca-600/15 ' +
  'disabled:cursor-default disabled:bg-tinta-50 disabled:text-tinta-800';

/** Tabelas de listagem. */
export const tabela = {
  moldura: 'overflow-x-auto',
  tabela: 'w-full text-left text-sm',
  cabeca: 'border-b border-tinta-200 bg-tinta-50 text-xs font-semibold text-tinta-600',
  th: 'px-4 py-2.5 font-semibold',
  linha: 'border-b border-tinta-100 last:border-0 hover:bg-tinta-50/60',
  td: 'px-4 py-3 align-middle',
};

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-tinta-500">{children}</p>;
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
    <p role="alert" className="rounded border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">
      {errorMessage(error)}
    </p>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return <p className="px-4 py-10 text-center text-sm text-tinta-500" aria-live="polite">{label}</p>;
}
