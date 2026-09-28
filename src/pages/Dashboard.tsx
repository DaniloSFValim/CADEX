import { useEffect, useState } from 'react';
import { Badge, Empty, ErrorNote, Kpi, Spinner, Titulo } from '../components/ui';
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

export default function Dashboard() {
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
    return <Empty titulo="Acesso negado" mensagem="Apenas o gestor tem acesso ao dashboard." />;
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorNote erro={error} />;

  return (
    <div className="flex flex-col gap-6">
      <Titulo titulo="Dashboard" />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          titulo="Análises Pendentes"
          valor={sumario?.analises_pendentes || 0}
          descricao="Mais de 15 dias pendentes"
          tom={sumario?.analises_pendentes ? 'alerta' : 'bom'}
        />
        <Kpi
          titulo="Saneamentos Vencendo"
          valor={sumario?.saneamentos_vencendo || 0}
          descricao="Prazo em até 7 dias"
          tom={sumario?.saneamentos_vencendo ? 'alerta' : 'bom'}
        />
        <Kpi
          titulo="Inscrições Vencendo"
          valor={sumario?.inscricoes_vencendo || 0}
          descricao="Validade em até 30 dias"
          tom={sumario?.inscricoes_vencendo ? 'alerta' : 'bom'}
        />
      </div>

      {/* Análises Pendentes */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Análises Pendentes (>15 dias)</h2>
        {analises.length === 0 ? (
          <Empty mensagem="Nenhuma análise pendente há mais de 15 dias." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Empresa</th>
                  <th className="px-4 py-2 text-left font-semibold">CNPJ</th>
                  <th className="px-4 py-2 text-left font-semibold">Requerida em</th>
                  <th className="px-4 py-2 text-right font-semibold">Dias Pendentes</th>
                </tr>
              </thead>
              <tbody>
                {analises.map((a) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{a.nome_fantasia || a.razao_social}</div>
                      <div className="text-xs text-gray-600">{a.razao_social}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-sm">{formatCnpj(a.cnpj)}</td>
                    <td className="px-4 py-2 text-sm">{a.data_requerimento}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge tom={a.dias_pendentes > 30 ? 'ruim' : 'alerta'}>{a.dias_pendentes} dias</Badge>
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
        <h2 className="mb-4 text-lg font-semibold">Saneamentos a Vencer (≤7 dias)</h2>
        {saneamentos.length === 0 ? (
          <Empty mensagem="Nenhum saneamento vencendo nos próximos 7 dias." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Empresa</th>
                  <th className="px-4 py-2 text-left font-semibold">CNPJ</th>
                  <th className="px-4 py-2 text-left font-semibold">Notificada em</th>
                  <th className="px-4 py-2 text-left font-semibold">Vence em</th>
                  <th className="px-4 py-2 text-right font-semibold">Dias Restantes</th>
                </tr>
              </thead>
              <tbody>
                {saneamentos.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{s.nome_fantasia || s.razao_social}</div>
                      <div className="text-xs text-gray-600">{s.razao_social}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-sm">{formatCnpj(s.cnpj)}</td>
                    <td className="px-4 py-2 text-sm">{s.notificacao_data}</td>
                    <td className="px-4 py-2 text-sm font-semibold text-red-600">{s.data_vencimento}</td>
                    <td className="px-4 py-2 text-right">
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
        <h2 className="mb-4 text-lg font-semibold">Inscrições a Vencer (≤30 dias)</h2>
        {inscricoes.length === 0 ? (
          <Empty mensagem="Nenhuma inscrição vencendo nos próximos 30 dias." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Empresa</th>
                  <th className="px-4 py-2 text-left font-semibold">CNPJ</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-left font-semibold">Vence em</th>
                  <th className="px-4 py-2 text-right font-semibold">Dias Restantes</th>
                </tr>
              </thead>
              <tbody>
                {inscricoes.map((i) => (
                  <tr key={i.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{i.nome_fantasia || i.razao_social}</div>
                      <div className="text-xs text-gray-600">{i.razao_social}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-sm">{formatCnpj(i.cnpj)}</td>
                    <td className="px-4 py-2">
                      <SituacaoBadge situacao={i.situacao_efetiva as any} />
                    </td>
                    <td className="px-4 py-2 text-sm font-semibold">{i.validade_ate}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge tom={i.dias_restantes <= 7 ? 'ruim' : 'alerta'}>{i.dias_restantes} dias</Badge>
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
