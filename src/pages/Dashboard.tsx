import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, ErrorNote, Kpi, Spinner, Titulo, linkTexto } from '../components/ui';
import { SituacaoBadge, dataBR } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj } from '../lib/cnpj';
import { supabase } from '../lib/supabase';
import { hojeISO, listarEmpresas, type Empresa } from '../lib/empresas';
import {
  listarLicencas, nomeExecutora, pendenciasLicencas, type LicencaComTrechos, type PendenciaLicenca,
} from '../lib/licencas';

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
  const [licencas, setLicencas] = useState<LicencaComTrechos[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!podeEditar) return;

    (async () => {
      try {
        const [sumRes, anlRes, sanRes, insRes, lic, emp] = await Promise.all([
          supabase.rpc('dashboard_sumario'),
          supabase.rpc('dashboard_analises_pendentes'),
          supabase.rpc('dashboard_saneamentos_vencimento'),
          supabase.rpc('dashboard_inscricoes_vencimento'),
          listarLicencas(),
          listarEmpresas(),
        ]);

        if (sumRes.error) throw sumRes.error;
        if (anlRes.error) throw anlRes.error;
        if (sanRes.error) throw sanRes.error;
        if (insRes.error) throw insRes.error;

        setSumario(sumRes.data[0] || { analises_pendentes: 0, saneamentos_vencendo: 0, inscricoes_vencendo: 0 });
        setAnalises(anlRes.data || []);
        setSaneamentos(sanRes.data || []);
        setInscricoes(insRes.data || []);
        setLicencas(lic);
        setEmpresas(emp);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [podeEditar]);

  const obras = useMemo(() => pendenciasLicencas(licencas, hojeISO()), [licencas]);
  const porId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);

  if (!podeEditar) {
    return <Empty>Acesso negado: apenas o gestor tem acesso ao dashboard.</Empty>;
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorNote error={error} />;

  return (
    <div className="flex flex-col gap-6">
      <Titulo titulo="Painel da gestão" descricao="Prazos da SECONSER que pedem atenção agora." />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          rotulo="análises atrasadas"
          valor={sumario?.analises_pendentes || 0}
          detalhe="requeridas há mais de 15 dias"
          tom={sumario?.analises_pendentes ? 'atencao' : undefined}
        />
        <Kpi
          rotulo="saneamentos no fim do prazo"
          valor={sumario?.saneamentos_vencendo || 0}
          detalhe="vencem em até 7 dias"
          tom={sumario?.saneamentos_vencendo ? 'atencao' : undefined}
        />
        <Kpi
          rotulo="inscrições por vencer"
          valor={sumario?.inscricoes_vencendo || 0}
          detalhe="validade termina em até 30 dias"
          tom={sumario?.inscricoes_vencendo ? 'atencao' : undefined}
        />
      </div>

      {/* Análises Pendentes */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Análises requeridas há mais de 15 dias</h2>
        {analises.length === 0 ? (
          <Empty>Nenhuma análise pendente há mais de 15 dias.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-tinta-200 bg-tinta-50 text-[13px] text-tinta-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Empresa</th>
                  <th className="px-4 py-2 text-left font-semibold">CNPJ</th>
                  <th className="px-4 py-2 text-left font-semibold">Requerida em</th>
                  <th className="px-4 py-2 text-right font-semibold">Dias em análise</th>
                </tr>
              </thead>
              <tbody>
                {analises.map((a) => (
                  <tr key={a.id} className="border-b border-tinta-100 hover:bg-marca-50/40">
                    <td className="px-4 py-2">
                      <div className="font-medium">{a.nome_fantasia || a.razao_social}</div>
                      <div className="text-xs text-tinta-500">{a.razao_social}</div>
                    </td>
                    <td className="px-4 py-2 tabular text-sm">{formatCnpj(a.cnpj)}</td>
                    <td className="px-4 py-2 text-sm">{dataBR(a.data_requerimento)}</td>
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
        <h2 className="mb-4 text-lg font-semibold">Saneamentos que vencem em até 7 dias</h2>
        {saneamentos.length === 0 ? (
          <Empty>Nenhum saneamento vencendo nos próximos 7 dias.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-tinta-200 bg-tinta-50 text-[13px] text-tinta-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Empresa</th>
                  <th className="px-4 py-2 text-left font-semibold">CNPJ</th>
                  <th className="px-4 py-2 text-left font-semibold">Notificada em</th>
                  <th className="px-4 py-2 text-left font-semibold">Vence em</th>
                  <th className="px-4 py-2 text-right font-semibold">Dias restantes</th>
                </tr>
              </thead>
              <tbody>
                {saneamentos.map((s) => (
                  <tr key={s.id} className="border-b border-tinta-100 hover:bg-marca-50/40">
                    <td className="px-4 py-2">
                      <div className="font-medium">{s.nome_fantasia || s.razao_social}</div>
                      <div className="text-xs text-tinta-500">{s.razao_social}</div>
                    </td>
                    <td className="px-4 py-2 tabular text-sm">{formatCnpj(s.cnpj)}</td>
                    <td className="px-4 py-2 text-sm">{dataBR(s.notificacao_data)}</td>
                    <td className="px-4 py-2 text-sm font-semibold text-baixa">{dataBR(s.data_vencimento)}</td>
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
        <h2 className="mb-4 text-lg font-semibold">Inscrições que vencem em até 30 dias</h2>
        {inscricoes.length === 0 ? (
          <Empty>Nenhuma inscrição vencendo nos próximos 30 dias.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-tinta-200 bg-tinta-50 text-[13px] text-tinta-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Empresa</th>
                  <th className="px-4 py-2 text-left font-semibold">CNPJ</th>
                  <th className="px-4 py-2 text-left font-semibold">Situação</th>
                  <th className="px-4 py-2 text-left font-semibold">Vence em</th>
                  <th className="px-4 py-2 text-right font-semibold">Dias restantes</th>
                </tr>
              </thead>
              <tbody>
                {inscricoes.map((i) => (
                  <tr key={i.id} className="border-b border-tinta-100 hover:bg-marca-50/40">
                    <td className="px-4 py-2">
                      <div className="font-medium">{i.nome_fantasia || i.razao_social}</div>
                      <div className="text-xs text-tinta-500">{i.razao_social}</div>
                    </td>
                    <td className="px-4 py-2 tabular text-sm">{formatCnpj(i.cnpj)}</td>
                    <td className="px-4 py-2">
                      <SituacaoBadge s={i.situacao_efetiva as any} />
                    </td>
                    <td className="px-4 py-2 text-sm font-semibold">{dataBR(i.validade_ate)}</td>
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

      {/* Licenças de obra */}
      <section className="mt-4 border-t border-tinta-200 pt-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold tracking-[-0.015em] text-tinta-900">Licenças de obra</h2>
          <Link to="/obras" className={`${linkTexto} text-sm`}>Ver todas as licenças</Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Kpi rotulo="prazos encerrados" valor={obras.prazoEncerrado.length}
               detalhe="cronograma vencido sem conclusão registrada"
               tom={obras.prazoEncerrado.length ? 'baixa' : undefined} />
          <Kpi rotulo="sem As Built" valor={obras.semAsBuilt.length}
               detalhe="obra concluída sem o projeto como construído (art. 26)"
               tom={obras.semAsBuilt.length ? 'atencao' : undefined} />
        </div>

        <TabelaPendencias
          titulo="Prazo do cronograma encerrado"
          vazio="Nenhuma licença com prazo encerrado sem conclusão."
          coluna="Prazo terminou em" data={(l) => l.fim_previsto} sufixo="de atraso" tom="ruim"
          itens={obras.prazoEncerrado} porId={porId} />
        <TabelaPendencias
          titulo="Obra concluída sem As Built"
          vazio="Nenhuma obra concluída aguardando As Built."
          coluna="Concluída em" data={(l) => l.concluida_em} sufixo="sem As Built" tom="alerta"
          itens={obras.semAsBuilt} porId={porId} />

        {obras.historicasEmAberto > 0 && (
          <p className="mt-4 text-sm text-tinta-500">
            Além dessas, {obras.historicasEmAberto} licença{obras.historicasEmAberto === 1 ? '' : 's'} anterior
            {obras.historicasEmAberto === 1 ? '' : 'es'} à Resolução sem conclusão ou As Built registrados. Não
            entram nas listas: são registro histórico e costumam vir sem esses dados.
          </p>
        )}
      </section>
    </div>
  );
}

function TabelaPendencias({ titulo, vazio, coluna, data, sufixo, tom, itens, porId }: {
  titulo: string; vazio: string; coluna: string; data: (l: LicencaComTrechos) => string | null;
  sufixo: string; tom: 'ruim' | 'alerta'; itens: PendenciaLicenca[];
  porId: Map<string, Empresa>;
}) {
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-base font-semibold text-tinta-900">{titulo}</h3>
      {itens.length === 0 ? (
        <Empty>{vazio}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-tinta-200 bg-tinta-50 text-[13px] text-tinta-500">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Licença</th>
                <th className="px-4 py-2 text-left font-semibold">Executora</th>
                <th className="px-4 py-2 text-left font-semibold">Local</th>
                <th className="px-4 py-2 text-left font-semibold">{coluna}</th>
                <th className="px-4 py-2 text-right font-semibold">Dias</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(({ licenca: l, dias }) => (
                <tr key={l.id} className="border-b border-tinta-100 hover:bg-marca-50/40">
                  <td className="px-4 py-2">
                    <Link to={`/obras/${l.id}`} className="font-medium hover:text-marca-700 hover:underline">{l.numero}</Link>
                    <div className="tabular text-xs text-tinta-500">{l.processo_sei}</div>
                  </td>
                  <td className="px-4 py-2">{nomeExecutora(l, porId)}</td>
                  <td className="px-4 py-2">
                    {l.licenca_trechos[0]?.logradouro ?? '—'}
                    {l.licenca_trechos[0]?.bairro && <span className="text-tinta-500">, {l.licenca_trechos[0].bairro}</span>}
                  </td>
                  <td className="tabular px-4 py-2">{dataBR(data(l))}</td>
                  <td className="px-4 py-2 text-right">
                    <Badge tom={tom}>{dias} dia{dias === 1 ? '' : 's'} {sufixo}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
