import type { ReactNode } from 'react';

export type Tom = 'neutro' | 'bom' | 'alerta' | 'ruim';

// Selo como carimbo de registro: contorno na cor da situação, sem preenchimento forte.
const TOM: Record<Tom, string> = {
  neutro: 'border-tinta-300 bg-white text-tinta-600',
  bom: 'border-alta/60 bg-alta/4 text-alta',
  alerta: 'border-atencao/60 bg-atencao/4 text-atencao',
  ruim: 'border-baixa/60 bg-baixa/4 text-baixa',
};

export function Badge({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-xs border px-1.5 py-px text-xs font-semibold ${TOM[tom]}`}>
      {children}
    </span>
  );
}

export function Card({
  title, action, children, semPadding = false,
}: { title?: ReactNode; action?: ReactNode; children: ReactNode; semPadding?: boolean }) {
  return (
    <section>
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="font-display text-xl font-bold tracking-[-0.01em] text-tinta-900">{title}</h2>
          {action}
        </header>
      )}
      <div className={`cartao ${semPadding ? '' : 'p-5'}`}>{children}</div>
    </section>
  );
}

/** Título da página: trilha, título, descrição e ações à direita. */
export function Titulo({
  trilha, titulo, descricao, acoes, children,
}: { trilha?: ReactNode; titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {trilha && (
          <div className="mb-2 text-sm font-medium text-tinta-500">{trilha}</div>
        )}
        <h1 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.01em] text-tinta-900 sm:text-4xl">{titulo}</h1>
        {descricao && <div className="mt-1.5 max-w-2xl text-sm text-tinta-500">{descricao}</div>}
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
    primary: 'bg-marca-600 text-white hover:bg-marca-800 active:bg-marca-900',
    secondary: 'bg-white text-tinta-800 ring-1 ring-inset ring-tinta-300 hover:bg-tinta-50 hover:ring-tinta-400',
    danger: 'bg-white text-baixa ring-1 ring-inset ring-baixa/30 hover:bg-baixa/10',
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold
        transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** Mesmo visual dos botões, para links (react-router). */
export const botaoLink = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-sm bg-marca-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-marca-800 active:bg-marca-900',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-sm bg-white px-4 py-2 text-sm font-semibold text-tinta-800 ring-1 ring-inset ring-tinta-300 transition-colors hover:bg-tinta-50 hover:ring-tinta-400',
};

export function Field({
  label, hint, children, required, className = '',
}: { label: string; hint?: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[13px] font-medium text-tinta-700">
        {label}
        {required && <span className="ml-0.5 text-baixa" aria-hidden>*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-tinta-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-sm border border-tinta-300 bg-white px-3 py-2 text-sm text-tinta-900 ' +
  'placeholder:text-tinta-400 hover:border-tinta-400 focus:border-marca-600 focus:outline-hidden focus:ring-4 focus:ring-marca-500/15 ' +
  'disabled:cursor-default disabled:bg-tinta-50 disabled:text-tinta-800';

/** Tabelas de listagem. */
export const tabela = {
  moldura: 'overflow-x-auto',
  tabela: 'w-full text-left text-sm',
  cabeca: 'border-b border-tinta-200 text-left',
  th: 'px-3 py-2.5 font-medium text-tinta-400',
  linha: 'border-b border-tinta-100 last:border-0 hover:bg-tinta-50 focus-within:bg-tinta-50',
  td: 'px-3 py-2.5 align-middle',
};

/** Indicador no desenho do NETRANK: fio escuro no topo, rótulo, número grande e detalhe. */
export function Kpi({ rotulo, valor, detalhe, tom }: {
  rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: 'alta' | 'baixa' | 'atencao';
}) {
  const cor = tom ? { alta: 'text-alta', baixa: 'text-baixa', atencao: 'text-atencao' }[tom] : 'text-tinta-900';
  return (
    <div className="border-t-2 border-tinta-900 pt-3">
      <div className="text-sm font-medium text-tinta-600">{rotulo}</div>
      <div className={`tabular mt-1 text-3xl font-semibold tracking-[-0.02em] ${cor}`}>{valor}</div>
      {detalhe && <div className="mt-1 text-sm text-tinta-400">{detalhe}</div>}
    </div>
  );
}

/** Link de texto sublinhado, como os atalhos do NETRANK. */
export const linkTexto =
  'font-semibold text-marca-600 underline decoration-marca-200 decoration-2 underline-offset-4 hover:decoration-marca-500';

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
    <p role="alert" className="rounded-sm border-l-4 border-baixa bg-baixa/10 px-3 py-2 text-sm text-baixa">
      {errorMessage(error)}
    </p>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return <p className="px-4 py-10 text-center text-sm text-tinta-500" aria-live="polite">{label}</p>;
}
