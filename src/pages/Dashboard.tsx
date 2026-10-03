import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, ErrorNote, Kpi, Spinner, linkTexto } from '../components/ui';
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

  const pendencias =
    (sumario?.analises_pendentes || 0) + (sumario?.saneamentos_vencendo || 0) +
    (sumario?.inscricoes_vencendo || 0) + obras.prazoEncerrado.length + obras.semAsBuilt.length;

  return (
    <div className="flex flex-col gap-14">
      <header className="max-w-3xl">
        <p className="text-sm text-tinta-500">Painel da SECONSER em {dataBR(hojeISO())}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-tinta-900 sm:text-4xl sm:leading-[1.15]">
          {pendencias === 0
            ? 'Nada pede atenção agora.'
            : `${pendencias} ${pendencias === 1 ? 'item pede' : 'itens pedem'} atenção.`}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-tinta-500">
          {pendencias === 0
            ? 'Nenhum prazo de inscrição ou licença está no limite; as listas abaixo estão vazias.'
            : 'Cada empresa e obra que precisa de ação está nas listas abaixo, em ordem de urgência.'}
        </p>
        <nav className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-base" aria-label="Atalhos">
          <Link to="/" className={linkTexto}>Ver empresas</Link>
          <Link to="/obras" className={linkTexto}>Ver obras</Link>
        </nav>
      </header>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
        <Kpi
          rotulo="Análises atrasadas"
          valor={sumario?.analises_pendentes || 0}
          detalhe="requeridas há mais de 15 dias"
          tom={sumario?.analises_pendentes ? 'atencao' : undefined}
        />
        <Kpi
          rotulo="Saneamentos no fim do prazo"
          valor={sumario?.saneamentos_vencendo || 0}
          detalhe="vencem em até 7 dias"
          tom={sumario?.saneamentos_vencendo ? 'atencao' : undefined}
        />
        <Kpi
          rotulo="Inscrições por vencer"
          valor={sumario?.inscricoes_vencendo || 0}
          detalhe="validade termina em até 30 dias"
          tom={sumario?.inscricoes_vencendo ? 'atencao' : undefined}
        />
      </div>

      {/* Análises Pendentes */}
      <section>
        <CabecalhoSecao titulo="Análises atrasadas"
                        descricao="Inscrições requeridas há mais de 15 dias sem decisão." />
        {/* Análises requeridas há mais de 15 dias */}
        {analises.length === 0 ? (
          <Empty>Nenhuma análise pendente há mais de 15 dias.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-tinta-200 text-tinta-400">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Empresa</th>
                  <th className="px-3 py-2.5 text-left font-medium">CNPJ</th>
                  <th className="px-3 py-2.5 text-left font-medium">Requerida em</th>
                  <th className="px-3 py-2.5 text-right font-medium">Dias em análise</th>
                </tr>
              </thead>
              <tbody>
                {analises.map((a) => (
                  <tr key={a.id} className="border-b border-tinta-100 hover:bg-tinta-50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{a.nome_fantasia || a.razao_social}</div>
                      <div className="text-xs text-tinta-500">{a.razao_social}</div>
                    </td>
                    <td className="px-3 py-2.5 tabular text-sm">{formatCnpj(a.cnpj)}</td>
                    <td className="px-3 py-2.5 text-sm">{dataBR(a.data_requerimento)}</td>
                    <td className="px-3 py-2.5 text-right">
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
        <CabecalhoSecao titulo="Saneamentos no fim do prazo"
                        descricao="Empresas em saneamento cujo prazo vence em até 7 dias." />
        {saneamentos.length === 0 ? (
          <Empty>Nenhum saneamento vencendo nos próximos 7 dias.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-tinta-200 text-tinta-400">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Empresa</th>
                  <th className="px-3 py-2.5 text-left font-medium">CNPJ</th>
                  <th className="px-3 py-2.5 text-left font-medium">Notificada em</th>
                  <th className="px-3 py-2.5 text-left font-medium">Vence em</th>
                  <th className="px-3 py-2.5 text-right font-medium">Dias restantes</th>
                </tr>
              </thead>
              <tbody>
                {saneamentos.map((s) => (
                  <tr key={s.id} className="border-b border-tinta-100 hover:bg-tinta-50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{s.nome_fantasia || s.razao_social}</div>
                      <div className="text-xs text-tinta-500">{s.razao_social}</div>
                    </td>
                    <td className="px-3 py-2.5 tabular text-sm">{formatCnpj(s.cnpj)}</td>
                    <td className="px-3 py-2.5 text-sm">{dataBR(s.notificacao_data)}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-baixa">{dataBR(s.data_vencimento)}</td>
                    <td className="px-3 py-2.5 text-right">
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
        <CabecalhoSecao titulo="Inscrições por vencer"
                        descricao="Inscrições APTA cuja validade termina em até 30 dias." />
        {inscricoes.length === 0 ? (
          <Empty>Nenhuma inscrição vencendo nos próximos 30 dias.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-tinta-200 text-tinta-400">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Empresa</th>
                  <th className="px-3 py-2.5 text-left font-medium">CNPJ</th>
                  <th className="px-3 py-2.5 text-left font-medium">Situação</th>
                  <th className="px-3 py-2.5 text-left font-medium">Vence em</th>
                  <th className="px-3 py-2.5 text-right font-medium">Dias restantes</th>
                </tr>
              </thead>
              <tbody>
                {inscricoes.map((i) => (
                  <tr key={i.id} className="border-b border-tinta-100 hover:bg-tinta-50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{i.nome_fantasia || i.razao_social}</div>
                      <div className="text-xs text-tinta-500">{i.razao_social}</div>
                    </td>
                    <td className="px-3 py-2.5 tabular text-sm">{formatCnpj(i.cnpj)}</td>
                    <td className="px-3 py-2.5">
                      <SituacaoBadge s={i.situacao_efetiva as any} />
                    </td>
                    <td className="px-3 py-2.5 text-sm font-semibold">{dataBR(i.validade_ate)}</td>
                    <td className="px-3 py-2.5 text-right">
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
      <section className="border-t border-tinta-200 pt-10">
        <CabecalhoSecao titulo="Licenças de obra"
                        descricao="Obras cujo acompanhamento está pendente (arts. 24 e 26)."
                        acao={<Link to="/obras" className={`${linkTexto} text-sm`}>Ver todas as licenças</Link>} />
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          <Kpi rotulo="Prazos encerrados" valor={obras.prazoEncerrado.length}
               detalhe="cronograma vencido sem conclusão registrada"
               tom={obras.prazoEncerrado.length ? 'baixa' : undefined} />
          <Kpi rotulo="Sem As Built" valor={obras.semAsBuilt.length}
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

/** Cabeçalho de seção no padrão do NETRANK: título, uma linha de descrição e ação opcional. */
function CabecalhoSecao({ titulo, descricao, acao }: { titulo: string; descricao: string; acao?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-tinta-900">{titulo}</h2>
        <p className="mt-1 text-sm text-tinta-500">{descricao}</p>
      </div>
      {acao}
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
          <table className="w-full text-left text-sm">
            <thead className="border-b border-tinta-200 text-tinta-400">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">Licença</th>
                <th className="px-3 py-2.5 text-left font-medium">Executora</th>
                <th className="px-3 py-2.5 text-left font-medium">Local</th>
                <th className="px-3 py-2.5 text-left font-medium">{coluna}</th>
                <th className="px-3 py-2.5 text-right font-medium">Dias</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(({ licenca: l, dias }) => (
                <tr key={l.id} className="border-b border-tinta-100 hover:bg-tinta-50">
                  <td className="px-3 py-2.5">
                    <Link to={`/obras/${l.id}`} className="font-medium hover:text-marca-700 hover:underline">{l.numero}</Link>
                    <div className="tabular text-xs text-tinta-500">{l.processo_sei}</div>
                  </td>
                  <td className="px-3 py-2.5">{nomeExecutora(l, porId)}</td>
                  <td className="px-3 py-2.5">
                    {l.licenca_trechos[0]?.logradouro ?? '—'}
                    {l.licenca_trechos[0]?.bairro && <span className="text-tinta-500">, {l.licenca_trechos[0].bairro}</span>}
                  </td>
                  <td className="tabular px-3 py-2.5">{dataBR(data(l))}</td>
                  <td className="px-3 py-2.5 text-right">
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
