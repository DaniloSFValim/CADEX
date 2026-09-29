import { useEffect, useState } from 'react';
import { Badge, Empty, ErrorNote, Spinner } from '../components/ui';
import { SituacaoBadge } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj } from '../lib/cnpj';
import { supabase } from '../lib/supabase';

interface AnalisePendente {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  tipo: string;
  data_requerimento: string;
  dias_pendentes: number;
  processo_numero: string | null;
}

interface SaneamentoVencimento {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  tipo: string;
  notificacao_data: string;
  dias_restantes: number;
  data_vencimento: string;
  processo_numero: string | null;
}

interface InscricaoVencimento {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  tipo: string;
  situacao_efetiva: string;
  portaria_data: string;
  validade_ate: string;
  dias_restantes: number;
  processo_numero: string | null;
}

interface Sumario {
  analises_pendentes: number;
  saneamentos_vencendo: number;
  inscricoes_vencendo: number;
}

function getStatusTom(dias: number, limite: number): 'ruim' | 'alerta' {
  return dias > limite ? 'ruim' : 'alerta';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { podeEditar } = useAuth();
  const [sumario, setSumario] = useState<Sumario | null>(null);
  const [analises, setAnalises] = useState<AnalisePendente[]>([]);
  const [saneamentos, setSaneamentos] = useState<SaneamentoVencimento[]>([]);
  const [inscricoes, setInscricoes] = useState<InscricaoVencimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!podeEditar) return;

    (async () => {
      try {
        const [sumRes, anlRes, sanRes, insRes] = await Promise.all([
          supabase.rpc('dashboard_sumario'),
          supabase.rpc('dashboard_analises_pendentes'),
          supabase.rpc('dashboard_saneamentos_vencimento'),
          supabase.rpc('dashboard_inscricoes_vencimento'),
        ]);

        if (sumRes.error) throw sumRes.error;
        if (anlRes.error) throw anlRes.error;
        if (sanRes.error) throw sanRes.error;
        if (insRes.error) throw insRes.error;

        setSumario(sumRes.data[0] || { analises_pendentes: 0, saneamentos_vencendo: 0, inscricoes_vencendo: 0 });
        setAnalises(anlRes.data || []);
        setSaneamentos(sanRes.data || []);
        setInscricoes(insRes.data || []);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [podeEditar]);

  if (!podeEditar) {
    return <Empty>Acesso negado: apenas o gestor tem acesso ao dashboard.</Empty>;
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorNote error={error} />;

  return (
    <div className="flex flex-col gap-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary-500">Dashboard</h1>
          <p className="mt-1 text-sm text-tinta-500">Gestão centralizada de inscrições e documentação</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors">
            + Nova inscrição
          </button>
          <button className="rounded border border-primary-500 px-4 py-2 text-sm font-semibold text-primary-500 hover:bg-primary-50 transition-colors">
            Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Registros em Gestão"
          value={inscricoes.length}
          meta="Total sob responsabilidade"
          variant="default"
        />
        <KpiCard
          label="Documentos Vencendo"
          value={sumario?.inscricoes_vencendo || 0}
          meta="Próximos 30 dias"
          variant="warning"
        />
        <KpiCard
          label="Saneamentos a Vencer"
          value={sumario?.saneamentos_vencendo || 0}
          meta="Próximos 7 dias"
          variant="critical"
        />
        <KpiCard
          label="Em Análise"
          value={sumario?.analises_pendentes || 0}
          meta="Aguardando revisão"
          variant="info"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded border border-tinta-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="search-input" className="text-2xs font-bold uppercase tracking-wider text-tinta-400">Buscar</label>
          <input
            id="search-input"
            name="search"
            type="text"
            placeholder="CNPJ, razão social..."
            className="w-full rounded border border-tinta-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="situacao-select" className="text-2xs font-bold uppercase tracking-wider text-tinta-400">Situação</label>
          <select id="situacao-select" name="situacao" className="rounded border border-tinta-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none">
            <option>Todas</option>
            <option>APTA</option>
            <option>EM ANÁLISE</option>
            <option>VENCIDA</option>
            <option>EM SANEAMENTO</option>
            <option>INAPTA</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tipo-select" className="text-2xs font-bold uppercase tracking-wider text-tinta-400">Tipo</label>
          <select id="tipo-select" name="tipo" className="rounded border border-tinta-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none">
            <option>Todas</option>
            <option>Operadora</option>
            <option>Terceirizada</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="rounded bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors">
            Filtrar
          </button>
        </div>
      </div>

      {/* Análises Pendentes */}
      <section>
        <h2 className="font-serif mb-4 text-xl font-bold text-primary-500">Análises Pendentes (mais de 15 dias)</h2>
        {analises.length === 0 ? (
          <Empty>Nenhuma análise pendente há mais de 15 dias.</Empty>
        ) : (
          <div className="overflow-x-auto rounded border border-tinta-200">
            <table className="w-full text-sm">
              <thead className="border-b-2 border-tinta-200 bg-tinta-50">
                <tr>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Empresa</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">CNPJ</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Requerida em</th>
                  <th className="px-4 py-3 text-right font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Dias Pendentes</th>
                </tr>
              </thead>
              <tbody>
                {analises.map((a) => (
                  <tr key={a.id} className="border-b border-tinta-200 hover:bg-tinta-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-tinta-900">{a.nome_fantasia || a.razao_social}</div>
                      <div className="text-xs text-tinta-500">{a.razao_social}</div>
                    </td>
                    <td className="px-4 py-3 tabular text-sm text-tinta-700">{formatCnpj(a.cnpj)}</td>
                    <td className="px-4 py-3 text-sm text-tinta-700">{a.data_requerimento}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge tom={getStatusTom(a.dias_pendentes, 30)}>{a.dias_pendentes} dias</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Saneamentos Vencendo */}
      <section>
        <h2 className="font-serif mb-4 text-xl font-bold text-primary-500">Saneamentos a Vencer (até 7 dias)</h2>
        {saneamentos.length === 0 ? (
          <Empty>Nenhum saneamento vencendo nos próximos 7 dias.</Empty>
        ) : (
          <div className="overflow-x-auto rounded border border-tinta-200">
            <table className="w-full text-sm">
              <thead className="border-b-2 border-tinta-200 bg-tinta-50">
                <tr>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Empresa</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">CNPJ</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Notificada em</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Vence em</th>
                  <th className="px-4 py-3 text-right font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Dias Restantes</th>
                </tr>
              </thead>
              <tbody>
                {saneamentos.map((s) => (
                  <tr key={s.id} className="border-b border-tinta-200 hover:bg-tinta-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-tinta-900">{s.nome_fantasia || s.razao_social}</div>
                      <div className="text-xs text-tinta-500">{s.razao_social}</div>
                    </td>
                    <td className="px-4 py-3 tabular text-sm text-tinta-700">{formatCnpj(s.cnpj)}</td>
                    <td className="px-4 py-3 text-sm text-tinta-700">{s.notificacao_data}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-baixa">{s.data_vencimento}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge tom="ruim">{s.dias_restantes} dias</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Inscrições Vencendo */}
      <section>
        <h2 className="font-serif mb-4 text-xl font-bold text-primary-500">Inscrições a Vencer (até 30 dias)</h2>
        {inscricoes.length === 0 ? (
          <Empty>Nenhuma inscrição vencendo nos próximos 30 dias.</Empty>
        ) : (
          <div className="overflow-x-auto rounded border border-tinta-200">
            <table className="w-full text-sm">
              <thead className="border-b-2 border-tinta-200 bg-tinta-50">
                <tr>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Empresa</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">CNPJ</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Status</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Vence em</th>
                  <th className="px-4 py-3 text-right font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Dias Restantes</th>
                </tr>
              </thead>
              <tbody>
                {inscricoes.map((i) => (
                  <tr key={i.id} className="border-b border-tinta-200 hover:bg-tinta-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-tinta-900">{i.nome_fantasia || i.razao_social}</div>
                      <div className="text-xs text-tinta-500">{i.razao_social}</div>
                    </td>
                    <td className="px-4 py-3 tabular text-sm text-tinta-700">{formatCnpj(i.cnpj)}</td>
                    <td className="px-4 py-3">
                      <SituacaoBadge s={i.situacao_efetiva as any} />
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-tinta-900">{i.validade_ate}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge tom={getStatusTom(i.dias_restantes, 7)}>{i.dias_restantes} dias</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// KPI Card Component
function KpiCard({
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
  const variantStyles = {
    default: 'border-primary-500 text-primary-500',
    success: 'border-alta text-alta',
    warning: 'border-atencao text-atencao',
    critical: 'border-baixa text-baixa',
    info: 'border-primary-500 text-primary-500',
  };

  return (
    <div className={`rounded border-l-4 border-white bg-white p-6 shadow-sm ${variantStyles[variant]}`}>
      <div className="text-2xs font-bold uppercase tracking-wider text-tinta-400">{label}</div>
      <div className={`mt-2 font-serif text-3xl font-bold ${variantStyles[variant]}`}>{value}</div>
      <div className="mt-2 text-xs text-tinta-500">{meta}</div>
    </div>
  );
}
