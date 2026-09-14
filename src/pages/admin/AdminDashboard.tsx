import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card, Metric, Spinner, ErrorNote, Empty } from '../../components/ui';
import { MapView } from '../../components/MapView';
import type { PublicIntervention } from '../../lib/map';

/** §30 — Painel executivo. Indicadores vêm de uma RPC única, não de N queries. */
export default function AdminDashboard() {
  const metrics = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_metrics');
      if (error) throw error;
      return data as DashboardMetrics;
    },
  });

  const map = useQuery({
    queryKey: ['admin-map'],
    queryFn: async () => {
      const { data, error } = await supabase.from('public_interventions').select('*').limit(1000);
      if (error) throw error;
      return (data ?? []) as PublicIntervention[];
    },
  });

  if (metrics.isLoading) return <Spinner />;
  const m = metrics.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Painel de gestão</h1>
        <Link to="/admin/empresas" className="text-sm text-gov-700 underline-offset-2 hover:underline">
          Ir para o CADEX →
        </Link>
      </div>

      <ErrorNote error={metrics.error} />

      {m && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">CADEX</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
              <Metric label="Total" value={m.cadex.total} />
              <Metric label="Ativos" value={m.cadex.ativos} tone="good" />
              <Metric label="Em análise" value={m.cadex.pendentes} tone="warn" />
              <Metric label="Vencendo" value={m.cadex.vencendo} tone="warn" />
              <Metric label="Inaptos" value={m.cadex.inaptos} tone="bad" />
              <Metric label="Docs vencidos" value={m.documentos_vencidos} tone="bad" />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownCard title="Obras licenciadas" data={m.obras} />
            <BreakdownCard title="Manutenções" data={m.manutencoes} />
            <BreakdownCard title="Emergências" data={m.emergencias} />
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Fiscalização
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <Metric label="Fiscalizações" value={m.fiscalizacao.total} />
              <Metric label="Conformes" value={m.fiscalizacao.conformes} tone="good" />
              <Metric label="Irregularidades" value={m.fiscalizacao.irregularidades} tone="bad" />
            </div>
          </section>

          <Card title="Empresas reincidentes em irregularidade">
            {m.reincidentes.length === 0 ? (
              <Empty>Nenhuma reincidência registrada.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {m.reincidentes.map((r) => (
                  <li key={r.cadex_number ?? r.legal_name} className="flex justify-between py-2">
                    <span className="text-slate-800">{r.legal_name}</span>
                    <span className="font-medium tabular-nums text-red-700">
                      {r.irregularidades} ocorrências
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <Card title="Mapa operacional">
        {map.isLoading ? <Spinner /> : <MapView items={map.data ?? []} className="h-[460px]" />}
      </Card>
    </div>
  );
}

function BreakdownCard({ title, data }: { title: string; data: Record<string, number> | null }) {
  const entries = Object.entries(data ?? {});
  return (
    <Card title={title}>
      {entries.length === 0 ? (
        <Empty>Sem registros.</Empty>
      ) : (
        <ul className="space-y-1 text-sm">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span className="text-slate-600">{k.replace(/_/g, ' ')}</span>
              <span className="font-medium tabular-nums text-slate-900">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface DashboardMetrics {
  cadex: { total: number; ativos: number; pendentes: number; inaptos: number; vencendo: number };
  documentos_vencidos: number;
  obras: Record<string, number> | null;
  manutencoes: Record<string, number> | null;
  emergencias: Record<string, number> | null;
  fiscalizacao: { total: number; conformes: number; irregularidades: number };
  reincidentes: { legal_name: string; cadex_number: string | null; irregularidades: number }[];
}
