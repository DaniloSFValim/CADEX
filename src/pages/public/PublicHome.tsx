import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { PublicShell } from '../../components/Layout';
import { MapView } from '../../components/MapView';
import { Card, Metric, Spinner, ErrorNote, StatusBadge } from '../../components/ui';
import type { PublicIntervention } from '../../lib/map';

/**
 * §29 — Portal público. Lê exclusivamente as views `public_*`, que não
 * contêm dado pessoal (§36). Nenhuma tabela é acessível ao papel `anon`.
 */
export default function PublicHome() {
  const interventions = useQuery({
    queryKey: ['public-interventions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_interventions')
        .select('*')
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as PublicIntervention[];
    },
  });

  const companies = useQuery({
    queryKey: ['public-companies-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('public_companies')
        .select('cadex_number', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const rows = interventions.data ?? [];
  const by = (k: string) => rows.filter((r) => r.kind === k).length;
  const running = rows.filter((r) => r.started_at && !r.finished_at).length;
  const done = rows.filter((r) => r.finished_at).length;

  return (
    <PublicShell>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Intervenções em vias públicas, subsolo e espaço aéreo
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Consulte empresas habilitadas no CADEX, obras licenciadas, manutenções
            registradas e atendimentos emergenciais no território do Município.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/consulta"
              className="rounded-md bg-gov-700 px-4 py-2 text-sm font-medium text-white hover:bg-gov-800"
            >
              Consultar CADEX, licença ou protocolo
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Metric label="Empresas CADEX ativas" value={companies.data ?? '—'} tone="good" />
          <Metric label="Obras licenciadas" value={by('obra')} />
          <Metric label="Manutenções" value={by('manutencao')} />
          <Metric label="Emergências" value={by('emergencia')} tone="warn" />
          <Metric label="Em andamento" value={running} hint={`${done} concluídas`} />
        </div>

        <Card title="Mapa público de intervenções">
          {interventions.isLoading && <Spinner />}
          <ErrorNote error={interventions.error} />
          {interventions.isSuccess && <MapView items={rows} className="h-[520px]" />}
        </Card>

        <Card title="Intervenções recentes">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma intervenção publicada no momento.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Empresa executora</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Identificação</th>
                    <th className="py-2 pr-4">Local</th>
                    <th className="py-2 pr-4">Situação</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 25).map((r) => (
                    <tr key={r.public_token}>
                      <td className="py-2 pr-4 font-medium text-slate-800">{r.executor_name}</td>
                      <td className="py-2 pr-4 text-slate-600">{r.type_name ?? r.kind}</td>
                      <td className="py-2 pr-4 tabular-nums text-slate-600">
                        {r.license_number ?? r.declaration_number ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {[r.street, r.district].filter(Boolean).join(' — ') || '—'}
                      </td>
                      <td className="py-2 pr-4"><StatusBadge status={r.status} /></td>
                      <td className="py-2">
                        <Link
                          to={`/verificar/${r.public_token}`}
                          className="text-gov-700 underline-offset-2 hover:underline"
                        >
                          Detalhes
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
