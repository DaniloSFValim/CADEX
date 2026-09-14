import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { Card, Metric, Spinner, ErrorNote, Empty, StatusBadge } from '../../components/ui';
import { daysUntil, documentHealth, formatCnpj, isCadexActive } from '../../lib/rules';

/** §40 — "Meu painel" da empresa. Tudo filtrado pela RLS, não pelo cliente. */
export default function CompanyPanel() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const company = useQuery({
    queryKey: ['my-company', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', companyId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const docs = useQuery({
    queryKey: ['my-docs', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*, document_types(name, required)')
        .eq('company_id', companyId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const interventions = useQuery({
    queryKey: ['my-interventions', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interventions')
        .select('id, kind, description, street, starts_on, started_at, finished_at, licenses(status, license_number), declarations(status, declaration_number), emergencies(status)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const notifications = useQuery({
    queryKey: ['my-notifications', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!companyId) {
    return (
      <Empty>
        Seu usuário não está vinculado a nenhuma empresa. Solicite o vínculo à SECONSER.
      </Empty>
    );
  }
  if (company.isLoading) return <Spinner />;
  if (company.error) return <ErrorNote error={company.error} />;

  const c = company.data;
  const active = isCadexActive(c.status, c.valid_until);
  const expiredDocs = (docs.data ?? []).filter(
    (d: any) => documentHealth(d.valid_until) === 'vencido' || d.status === 'vencido',
  );
  const expiringDocs = (docs.data ?? []).filter(
    (d: any) => documentHealth(d.valid_until) === 'vencendo' && d.status === 'aprovado',
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{c.legal_name}</h1>
        <p className="text-sm text-slate-600">
          {formatCnpj(c.cnpj)} · CADEX {c.cadex_number ?? 'não emitido'}
        </p>
      </div>

      {!active && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-900">
            Sua inscrição não está ativa. Enquanto isso, a empresa não pode solicitar
            licença, registrar manutenção nem atuar como executora ou subcontratada
            em intervenções sujeitas a habilitação.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="Situação CADEX"
          value={<StatusBadge status={c.status} />}
          tone={active ? 'good' : 'bad'}
        />
        <Metric
          label="Validade"
          value={c.valid_until ? `${daysUntil(c.valid_until)}d` : '—'}
          hint={c.valid_until ? new Date(`${c.valid_until}T00:00:00`).toLocaleDateString('pt-BR') : undefined}
          tone={c.valid_until && daysUntil(c.valid_until) <= 30 ? 'warn' : 'neutral'}
        />
        <Metric label="Documentos vencidos" value={expiredDocs.length} tone={expiredDocs.length ? 'bad' : 'good'} />
        <Metric label="A vencer em 30 dias" value={expiringDocs.length} tone={expiringDocs.length ? 'warn' : 'neutral'} />
      </div>

      {(notifications.data?.length ?? 0) > 0 && (
        <Card title="Pendências e avisos">
          <ul className="divide-y divide-slate-100 text-sm">
            {notifications.data!.map((n: any) => (
              <li key={n.id} className="flex items-start gap-3 py-2">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    n.severity === 'critical' ? 'bg-red-600'
                    : n.severity === 'warning' ? 'bg-amber-500' : 'bg-slate-400'
                  }`}
                />
                <div>
                  <p className="font-medium text-slate-800">{n.title}</p>
                  <p className="text-slate-600">{n.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Minha documentação">
        {docs.isLoading && <Spinner />}
        {docs.data?.length === 0 && <Empty>Nenhum documento enviado.</Empty>}
        <ul className="divide-y divide-slate-100 text-sm">
          {(docs.data ?? []).map((d: any) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-medium text-slate-800">{d.document_types?.name}</span>
              <StatusBadge status={d.status} />
              {d.valid_until && (
                <span className="text-xs text-slate-500">
                  até {new Date(`${d.valid_until}T00:00:00`).toLocaleDateString('pt-BR')}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Minhas intervenções">
        {interventions.isLoading && <Spinner />}
        {interventions.data?.length === 0 && <Empty>Nenhuma intervenção registrada.</Empty>}
        <ul className="divide-y divide-slate-100 text-sm">
          {(interventions.data ?? []).map((i: any) => {
            const status =
              i.licenses?.[0]?.status ?? i.declarations?.[0]?.status ?? i.emergencies?.[0]?.status ?? null;
            const number = i.licenses?.[0]?.license_number ?? i.declarations?.[0]?.declaration_number;
            return (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{i.kind}</span>
                <span className="font-medium text-slate-800">{i.description}</span>
                {number && <span className="font-mono text-xs text-slate-500">{number}</span>}
                <span className="text-slate-600">{i.street}</span>
                <span className="ml-auto"><StatusBadge status={status} /></span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
