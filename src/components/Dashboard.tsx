import { ReactNode } from 'react';

// ============================================================================
// KPI CARD - Exibe métricas com status visual
// ============================================================================
export function KpiCard({
  label,
  value,
  meta,
  variant = 'default',
}: {
  label: string;
  value: number;
  meta: string;
  variant?: 'default' | 'success' | 'warning' | 'critical' | 'info';
}) {
  const borderColors = {
    default: 'border-primary-500',
    success: 'border-alta',
    warning: 'border-atencao',
    critical: 'border-baixa',
    info: 'border-primary-500',
  };

  const textColors = {
    default: 'text-primary-500',
    success: 'text-alta',
    warning: 'text-atencao',
    critical: 'text-baixa',
    info: 'text-primary-500',
  };

  return (
    <div className={`rounded border-l-4 border-white bg-white p-6 shadow-sm ${borderColors[variant]}`}>
      <div className="text-2xs font-bold uppercase tracking-wider text-tinta-400">{label}</div>
      <div className={`mt-2 font-serif text-3xl font-bold ${textColors[variant]}`}>{value}</div>
      <div className="mt-2 text-xs text-tinta-500">{meta}</div>
    </div>
  );
}

// ============================================================================
// FILTER BAR - Filtros reutilizáveis
// ============================================================================
export function FilterBar({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-3 rounded border border-tinta-200 bg-white p-4">
      {children}
    </div>
  );
}

export function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-2xs font-bold uppercase tracking-wider text-tinta-400">{label}</label>
      {children}
    </div>
  );
}

// ============================================================================
// DATA TABLE - Tabela com styling consistente
// ============================================================================
export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded border border-tinta-200">
      <table className="w-full text-sm">
        <thead className="border-b-2 border-tinta-200 bg-tinta-50">
          <tr>
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="border-b border-tinta-200 hover:bg-tinta-50 transition-colors">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// PAGE HEADER - Header padrão para páginas
// ============================================================================
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl font-bold text-primary-500">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-tinta-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

// ============================================================================
// SECTION - Seção padrão com título
// ============================================================================
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif mb-4 text-xl font-bold text-primary-500">{title}</h2>
      {children}
    </section>
  );
}

// ============================================================================
// STAT CELL - Célula de dados para tabelas
// ============================================================================
export function StatCell({
  label,
  value,
  className = '',
}: {
  label?: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <div className="text-xs text-tinta-500">{label}</div>}
      <div className="font-medium text-tinta-900">{value}</div>
    </div>
  );
}
