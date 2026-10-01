import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Empty, ErrorNote, Kpi, Spinner, Titulo, botaoLink, inputClass, tabela } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { hojeISO, listarEmpresas, nomeEmpresa, type Empresa } from '../lib/empresas';
import {
  ESTADO_LICENCA_LABEL, TIPO_OBRA_LABEL, TOM_ESTADO_LICENCA, estadoLicenca, listarLicencas, nomeExecutora,
  type EstadoLicenca, type LicencaComTrechos,
} from '../lib/licencas';

const FILTROS: { valor: string; rotulo: string; inclui: EstadoLicenca[] }[] = [
  { valor: 'vigentes', rotulo: 'Vigentes (aguardando início ou em execução)', inclui: ['aguardando_inicio', 'em_execucao'] },
  { valor: 'pendencias', rotulo: 'Com pendência (prazo encerrado ou sem As Built)', inclui: ['prazo_encerrado', 'concluida_sem_as_built'] },
  { valor: 'em_analise', rotulo: 'Em análise', inclui: ['em_analise'] },
  { valor: 'concluida', rotulo: 'Concluídas', inclui: ['concluida'] },
  { valor: 'encerradas', rotulo: 'Indeferidas ou canceladas', inclui: ['indeferida', 'cancelada'] },
];

export default function Licencas() {
  const { podeEditar } = useAuth();
  const [licencas, setLicencas] = useState<LicencaComTrechos[] | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const hoje = hojeISO();

  useEffect(() => {
    Promise.all([listarLicencas(), listarEmpresas()])
      .then(([l, e]) => { setLicencas(l); setEmpresas(e); })
      .catch(setError);
  }, []);

  const porId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const inclui = FILTROS.find((f) => f.valor === filtro)?.inclui;
    return (licencas ?? []).filter((l) => {
      if (inclui && !inclui.includes(estadoLicenca(l, hoje))) return false;
      if (!q) return true;
      const empresasTxt = [l.executora_id, l.contratante_id, l.subcontratada_id]
        .map((id) => (id ? porId.get(id) : undefined))
        .flatMap((e) => (e ? [e.razao_social, e.nome_fantasia ?? '', e.codigo_cadex] : []));
      return [l.processo_sei, l.numero ?? '', l.escopo, ...empresasTxt,
              l.executora_razao_social ?? '', l.contratante_razao_social ?? '',
              ...l.licenca_trechos.flatMap((t) => [t.logradouro, t.bairro ?? ''])]
        .some((s) => s.toLowerCase().includes(q));
    });
  }, [licencas, busca, filtro, hoje, porId]);

  const conta = (e: EstadoLicenca[]) => (licencas ?? []).filter((l) => e.includes(estadoLicenca(l, hoje))).length;

  return (
    <>
      <Titulo
        titulo="Obras licenciadas"
        descricao="Licenças de obra de infraestrutura (arts. 10 a 14 da Resolução). O pedido tramita e é decidido no SEI; aqui fica o registro para consulta e fiscalização."
        acoes={podeEditar && <Link to="/obras/nova" className={botaoLink.primary}>Registrar licença</Link>}
      />

      {licencas && licencas.length > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
          <Kpi rotulo="Em execução" valor={conta(['em_execucao'])} tom="alta" detalhe="dentro do cronograma" />
          <Kpi rotulo="Aguardando início" valor={conta(['aguardando_inicio'])} detalhe="deferidas, antes do início" />
          <Kpi rotulo="Prazo encerrado" valor={conta(['prazo_encerrado'])} tom="baixa" detalhe="cronograma vencido sem conclusão" />
          <Kpi rotulo="Sem As Built" valor={conta(['concluida_sem_as_built'])} tom="atencao" detalhe="concluídas, art. 26 pendente" />
        </div>
      )}

      <section className="cartao">
        <div className="grid gap-3 border-b border-tinta-200 p-4 sm:grid-cols-[1fr_340px]">
          <input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar"
                 placeholder="Buscar por processo SEI, nº da licença, empresa ou rua" />
          <select className={inputClass} value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Situação">
            <option value="">Todas as situações</option>
            {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
        </div>
        <ErrorNote error={error} />
        {!licencas && !error && <Spinner />}
        {licencas && filtradas.length === 0 && (
          <Empty>
            {licencas.length === 0
              ? podeEditar ? 'Nenhuma licença registrada. Use Registrar licença para lançar a primeira.' : 'Nenhuma licença registrada.'
              : 'Nenhuma licença corresponde à busca.'}
          </Empty>
        )}
        {filtradas.length > 0 && <TabelaLicencas licencas={filtradas} porId={porId} hoje={hoje} />}
        {licencas && licencas.length > 0 && (
          <div className="border-t border-tinta-200 px-4 py-2.5 text-xs text-tinta-500">
            {filtradas.length} de {licencas.length} licença{licencas.length === 1 ? '' : 's'}
          </div>
        )}
      </section>
    </>
  );
}

export function TabelaLicencas({ licencas, porId, hoje, semExecutora = false }: {
  licencas: LicencaComTrechos[]; porId: Map<string, Empresa>; hoje: string; semExecutora?: boolean;
}) {
  return (
    <div className={tabela.moldura}>
      <table className={tabela.tabela}>
        <thead className={tabela.cabeca}>
          <tr>
            <th className={tabela.th}>Licença</th>
            {!semExecutora && <th className={tabela.th}>Executora</th>}
            <th className={tabela.th}>Local</th>
            <th className={tabela.th}>Cronograma</th>
            <th className={tabela.th}>Situação</th>
          </tr>
        </thead>
        <tbody>
          {licencas.map((l) => {
            const estado = estadoLicenca(l, hoje);
            const contr = l.contratante_id ? porId.get(l.contratante_id) : undefined;
            const nomeContr = contr ? nomeEmpresa(contr) : l.contratante_razao_social;
            const [t1, ...resto] = l.licenca_trechos;
            return (
              <tr key={l.id} className={tabela.linha}>
                <td className={tabela.td}>
                  <Link to={`/obras/${l.id}`} className="font-medium text-tinta-900 hover:text-marca-700 hover:underline">
                    {l.numero ?? 'Sem número'}
                  </Link>
                  <div className="tabular text-xs text-tinta-500">{l.processo_sei}</div>
                  {l.anterior_resolucao && <div className="text-xs text-tinta-500">anterior à Resolução</div>}
                </td>
                {!semExecutora && (
                  <td className={tabela.td}>
                    {nomeExecutora(l, porId)}
                    {nomeContr && <div className="text-xs text-tinta-500">para {nomeContr}</div>}
                  </td>
                )}
                <td className={tabela.td}>
                  {t1 ? <>{t1.logradouro}{t1.bairro && <span className="text-tinta-500">, {t1.bairro}</span>}</> : '—'}
                  <div className="text-xs text-tinta-500">
                    {l.tipos_obra.map((t) => TIPO_OBRA_LABEL[t]).join(', ')}
                    {resto.length > 0 && `; mais ${resto.length} trecho${resto.length > 1 ? 's' : ''}`}
                  </div>
                </td>
                <td className={`${tabela.td} tabular whitespace-nowrap text-xs text-tinta-700`}>
                  {l.inicio_previsto ? `${dataBR(l.inicio_previsto)} a ${dataBR(l.fim_previsto)}` : '—'}
                </td>
                <td className={tabela.td}><Badge tom={TOM_ESTADO_LICENCA[estado]}>{ESTADO_LICENCA_LABEL[estado]}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Seção da página da empresa: licenças em que ela é executora, contratante ou subcontratada. */
export function LicencasDaEmpresa({ empresa, todas }: { empresa: Empresa; todas: Empresa[] }) {
  const [licencas, setLicencas] = useState<LicencaComTrechos[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { listarLicencas(empresa.id).then(setLicencas).catch(setError); }, [empresa.id]);
  const porId = useMemo(() => new Map(todas.map((e) => [e.id, e])), [todas]);
  return (
    <Card title={`Licenças de obra${licencas ? ` (${licencas.length})` : ''}`} semPadding>
      <ErrorNote error={error} />
      {!licencas && !error && <Spinner />}
      {licencas && licencas.length === 0 && <Empty>Nenhuma licença de obra com esta empresa.</Empty>}
      {licencas && licencas.length > 0 && <TabelaLicencas licencas={licencas} porId={porId} hoje={hojeISO()} />}
    </Card>
  );
}
