import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { PublicShell } from '../../components/Layout';
import { MapView } from '../../components/MapView';
import { Card, Spinner, ErrorNote, StatusBadge } from '../../components/ui';
import type { PublicIntervention } from '../../lib/map';

/**
 * §15 — Placa digital da obra. É a página que o QR Code afixado no local
 * abre, e serve de verificação de autenticidade (§14, §43 Regra 7).
 */
export default function PublicVerify() {
  const { token = '' } = useParams();

  const q = useQuery({
    queryKey: ['verify', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('verify_public_token', { p_token: token });
      if (error) throw error;
      return data as PublicIntervention & { found?: boolean };
    },
  });

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        {q.isLoading && <Spinner label="Verificando autenticidade…" />}
        <ErrorNote error={q.error} />

        {q.isSuccess && (q.data as { found?: boolean }).found === false && (
          <Card title="Registro não localizado">
            <p className="text-sm text-slate-700">
              Este código não corresponde a nenhuma intervenção publicada. Se o QR Code
              está afixado em obra no local, registre a ocorrência à fiscalização.
            </p>
          </Card>
        )}

        {q.isSuccess && q.data && (q.data as { found?: boolean }).found !== false && (
          <Details item={q.data as PublicIntervention} />
        )}
      </div>
    </PublicShell>
  );
}

function Details({ item }: { item: PublicIntervention }) {
  const rows: [string, string | null][] = [
    ['Empresa executora', item.executor_name],
    ['CADEX da executora', item.executor_cadex],
    ['Concessionária contratante', item.concessionaire_name],
    ['Número da licença', item.license_number],
    ['Número da autodeclaração', item.declaration_number],
    ['Tipo', item.type_name],
    ['Escopo', item.scope ?? item.description],
    ['Logradouro', item.street],
    ['Bairro', item.district],
    ['Trecho', [item.segment_from, item.segment_to].filter(Boolean).join(' até ') || null],
    ['Início previsto', fmtDate(item.starts_on)],
    ['Encerramento previsto', fmtDate(item.ends_on)],
    ['Início efetivo', fmtDateTime(item.started_at)],
    ['Encerramento efetivo', fmtDateTime(item.finished_at)],
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-medium text-emerald-900">
          Registro autêntico — consta nos sistemas do Município.
        </p>
      </div>

      <Card
        title="Intervenção em espaço público"
        action={<StatusBadge status={item.status} />}
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
              <dd className="text-sm text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Localização">
        <MapView items={[item]} className="h-[340px]" />
      </Card>

      <p className="text-xs text-slate-500">
        Esta página apresenta apenas informações públicas da intervenção. Dados
        pessoais de trabalhadores e responsáveis não são divulgados (LGPD, §36).
      </p>
    </div>
  );
}

const fmtDate = (v: string | null) =>
  v ? new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR') : null;
const fmtDateTime = (v: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR') : null;
