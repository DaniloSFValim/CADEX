import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { PublicShell } from '../../components/Layout';
import { Card, Field, inputClass, Button, StatusBadge, ErrorNote, Empty } from '../../components/ui';
import { formatCnpj } from '../../lib/rules';

/**
 * §29 — Consulta pública de empresas CADEX e de intervenções.
 * Só toca as views públicas; o papel `anon` não tem grant em tabela alguma.
 */
export default function PublicConsulta() {
  const [tab, setTab] = useState<'empresas' | 'intervencoes'>('empresas');
  const [term, setTerm] = useState('');
  const [applied, setApplied] = useState('');

  const companies = useQuery({
    queryKey: ['pub-companies', applied],
    enabled: tab === 'empresas',
    queryFn: async () => {
      let q = supabase.from('public_companies').select('*').limit(100);
      if (applied.trim()) {
        const digits = applied.replace(/\D/g, '');
        q = digits.length >= 8
          ? q.eq('cnpj', digits)
          : q.or(`legal_name.ilike.%${applied}%,trade_name.ilike.%${applied}%,cadex_number.ilike.%${applied}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const interventions = useQuery({
    queryKey: ['pub-interv', applied],
    enabled: tab === 'intervencoes',
    queryFn: async () => {
      let q = supabase.from('public_interventions').select('*').limit(100);
      if (applied.trim()) {
        q = q.or(
          `license_number.ilike.%${applied}%,declaration_number.ilike.%${applied}%,` +
          `executor_name.ilike.%${applied}%,street.ilike.%${applied}%,district.ilike.%${applied}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <PublicShell>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900">Consulta pública</h1>

        <div className="flex gap-2" role="tablist">
          {(['empresas', 'intervencoes'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === t ? 'bg-gov-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'
              }`}
            >
              {t === 'empresas' ? 'Empresas CADEX' : 'Intervenções'}
            </button>
          ))}
        </div>

        <Card>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => { e.preventDefault(); setApplied(term); }}
          >
            <div className="min-w-[260px] flex-1">
              <Field
                label="Termo de busca"
                hint={tab === 'empresas'
                  ? 'CNPJ, razão social, nome fantasia ou número CADEX'
                  : 'Número da licença, autodeclaração, empresa, logradouro ou bairro'}
              >
                <input
                  className={inputClass}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={tab === 'empresas' ? '00.000.000/0001-00' : 'LIC-2026-000001'}
                />
              </Field>
            </div>
            <Button type="submit">Consultar</Button>
          </form>
        </Card>

        {tab === 'empresas' && (
          <Card title="Empresas habilitadas">
            <ErrorNote error={companies.error} />
            {companies.data?.length === 0 && <Empty>Nenhuma empresa encontrada.</Empty>}
            {(companies.data?.length ?? 0) > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">CADEX</th>
                      <th className="py-2 pr-4">Razão social</th>
                      <th className="py-2 pr-4">CNPJ</th>
                      <th className="py-2 pr-4">Qualificações</th>
                      <th className="py-2 pr-4">Situação</th>
                      <th className="py-2">Validade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {companies.data!.map((c: any) => (
                      <tr key={c.cadex_number}>
                        <td className="py-2 pr-4 font-mono text-xs">{c.cadex_number}</td>
                        <td className="py-2 pr-4 font-medium text-slate-800">{c.legal_name}</td>
                        <td className="py-2 pr-4 tabular-nums">{formatCnpj(c.cnpj)}</td>
                        <td className="py-2 pr-4 text-slate-600">{(c.qualifications ?? []).join(', ')}</td>
                        <td className="py-2 pr-4"><StatusBadge status={c.status} /></td>
                        <td className="py-2 tabular-nums">
                          {c.valid_until ? new Date(`${c.valid_until}T00:00:00`).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {tab === 'intervencoes' && (
          <Card title="Intervenções">
            <ErrorNote error={interventions.error} />
            {interventions.data?.length === 0 && <Empty>Nenhuma intervenção encontrada.</Empty>}
            <ul className="divide-y divide-slate-100">
              {(interventions.data ?? []).map((i: any) => (
                <li key={i.public_token} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="font-medium text-slate-800">{i.executor_name}</span>
                  <span className="text-sm text-slate-600">{i.type_name ?? i.kind}</span>
                  <span className="font-mono text-xs text-slate-500">
                    {i.license_number ?? i.declaration_number ?? ''}
                  </span>
                  <StatusBadge status={i.status} />
                  <Link
                    to={`/verificar/${i.public_token}`}
                    className="ml-auto text-sm text-gov-700 underline-offset-2 hover:underline"
                  >
                    Ver detalhes
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
