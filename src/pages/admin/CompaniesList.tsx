import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card, StatusBadge, Spinner, ErrorNote, Empty, Field, inputClass } from '../../components/ui';
import { daysUntil, formatCnpj } from '../../lib/rules';

const STATUSES = [
  'rascunho', 'protocolado', 'em_analise', 'pendente', 'deferido', 'ativo',
  'proximo_vencimento', 'inapto', 'indeferido', 'cancelado',
] as const;

/** §6, §9, §47 — lista administrativa do CADEX com filtros de situação. */
export default function CompaniesList() {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<string>('');

  const q = useQuery({
    queryKey: ['companies', term, status],
    queryFn: async () => {
      let query = supabase
        .from('companies')
        .select('id, cnpj, legal_name, trade_name, cadex_number, status, valid_until, analysis_due_date, remediation_due_date')
        .order('legal_name')
        .limit(200);
      if (status) query = query.eq('status', status);
      if (term.trim()) {
        const digits = term.replace(/\D/g, '');
        query = digits.length >= 8
          ? query.eq('cnpj', digits)
          : query.or(`legal_name.ilike.%${term}%,trade_name.ilike.%${term}%,cadex_number.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">CADEX — empresas</h1>

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <Field label="Buscar" hint="CNPJ, razão social, nome fantasia ou número CADEX">
              <input className={inputClass} value={term} onChange={(e) => setTerm(e.target.value)} />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Situação">
              <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todas</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Card>

      <Card title={`Resultados${q.data ? ` (${q.data.length})` : ''}`}>
        {q.isLoading && <Spinner />}
        <ErrorNote error={q.error} />
        {q.data?.length === 0 && <Empty>Nenhuma empresa encontrada com os filtros atuais.</Empty>}
        {(q.data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">CADEX</th>
                  <th className="py-2 pr-4">Razão social</th>
                  <th className="py-2 pr-4">CNPJ</th>
                  <th className="py-2 pr-4">Situação</th>
                  <th className="py-2 pr-4">Validade</th>
                  <th className="py-2">Prazo administrativo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data!.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-4 font-mono text-xs">{c.cadex_number ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <Link to={`/admin/empresas/${c.id}`} className="font-medium text-gov-700 hover:underline">
                        {c.legal_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{formatCnpj(c.cnpj)}</td>
                    <td className="py-2 pr-4"><StatusBadge status={c.status} /></td>
                    <td className="py-2 pr-4 tabular-nums">
                      {c.valid_until ? (
                        <>
                          {new Date(`${c.valid_until}T00:00:00`).toLocaleDateString('pt-BR')}
                          <span className={`ml-2 text-xs ${daysUntil(c.valid_until) < 0 ? 'text-red-700' : daysUntil(c.valid_until) <= 30 ? 'text-amber-700' : 'text-slate-500'}`}>
                            {daysUntil(c.valid_until) < 0
                              ? `${-daysUntil(c.valid_until)}d vencida`
                              : `${daysUntil(c.valid_until)}d`}
                          </span>
                        </>
                      ) : '—'}
                    </td>
                    <td className="py-2 text-xs text-slate-600">
                      {c.analysis_due_date && `Análise até ${fmt(c.analysis_due_date)}`}
                      {c.remediation_due_date && ` · Saneamento até ${fmt(c.remediation_due_date)}`}
                      {!c.analysis_due_date && !c.remediation_due_date && '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const fmt = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR');
