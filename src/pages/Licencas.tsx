import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExportarLicencas } from '../components/ExportarLicencas';
import { Badge, Button, Card, Empty, ErrorNote, Kpi, Spinner, Titulo, botaoLink, inputClass, tabela } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { SETORES, SETOR_LABEL, hojeISO, listarEmpresas, nomeEmpresa, type Empresa } from '../lib/empresas';
import {
  ESTADO_LICENCA_LABEL, ORIGENS, ORIGEM_LABEL, TIPOS_INTERVENCAO, TIPO_INTERVENCAO_LABEL, TIPO_OBRA_LABEL, origemPublica, TOM_ESTADO_LICENCA, desempenhoExecutora, estadoLicenca, listarLicencas, mesmaEmpresaNosPapeis, nomeExecutora, pendenciasLicencas,
  type Desempenho, type EstadoLicenca, type LicencaComTrechos, type NivelDesempenho,
} from '../lib/licencas';

const FILTROS: { valor: string; rotulo: string; inclui: EstadoLicenca[] }[] = [
  { valor: 'vigentes', rotulo: 'Vigentes (aguardando início ou em execução)', inclui: ['aguardando_inicio', 'em_execucao'] },
  { valor: 'pendencias', rotulo: 'Com pendência (prazo encerrado ou sem As Built)', inclui: ['prazo_encerrado', 'concluida_sem_as_built'] },
  { valor: 'em_analise', rotulo: 'Em análise', inclui: ['em_analise'] },
  { valor: 'concluida', rotulo: 'Concluídas', inclui: ['concluida'] },
  { valor: 'encerradas', rotulo: 'Canceladas (inclui indeferidas do histórico)', inclui: ['indeferida', 'cancelada'] },
];

export default function Licencas() {
  const { podeLicenciar } = useAuth();
  const [licencas, setLicencas] = useState<LicencaComTrechos[] | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const [setor, setSetor] = useState('');
  const [intervencao, setIntervencao] = useState('');
  const [origem, setOrigem] = useState('');
  const [exportando, setExportando] = useState(false);
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
      if (setor && l.setor !== setor) return false;
      if (intervencao && l.tipo_intervencao !== intervencao) return false;
      if (origem && l.origem_intervencao !== origem) return false;
      if (!q) return true;
      const empresasTxt = [l.executora_id, l.contratante_id, l.subcontratada_id]
        .map((id) => (id ? porId.get(id) : undefined))
        .flatMap((e) => (e ? [e.razao_social, e.nome_fantasia ?? '', e.codigo_cadex] : []));
      return [l.processo_sei, l.numero ?? '', l.escopo, ...empresasTxt,
              l.executora_razao_social ?? '', l.contratante_razao_social ?? '',
              ...l.licenca_trechos.flatMap((t) => [t.logradouro, t.bairro ?? ''])]
        .some((s) => s.toLowerCase().includes(q));
    });
  }, [licencas, busca, filtro, setor, intervencao, origem, hoje, porId]);

  const conta = (e: EstadoLicenca[]) => (licencas ?? []).filter((l) => e.includes(estadoLicenca(l, hoje))).length;

  return (
    <>
      <Titulo
        titulo="Obras licenciadas"
        descricao="Licenças de obra de infraestrutura (arts. 10 a 14 da Resolução). O pedido tramita e é decidido no SEI; aqui fica o registro para consulta e fiscalização."
        acoes={<>
          <Button variant="secondary" disabled={!licencas?.length} onClick={() => setExportando((x) => !x)}>
            Exportar (PDF ou planilha)
          </Button>
          {podeLicenciar && <Link to="/obras/nova" className={botaoLink.primary}>Registrar licença</Link>}
        </>}
      />

      {licencas && licencas.length > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
          <Kpi rotulo="Em execução" valor={conta(['em_execucao'])} tom="alta" detalhe="dentro do período da obra ou serviço" />
          <Kpi rotulo="Aguardando início" valor={conta(['aguardando_inicio'])} detalhe="deferidas, antes do início" />
          <Kpi rotulo="Prazo encerrado" valor={conta(['prazo_encerrado'])} tom="baixa" detalhe="fim da obra ou serviço vencido, sem conclusão" />
          <Kpi rotulo="Sem As Built" valor={conta(['concluida_sem_as_built'])} tom="atencao" detalhe="concluídas, art. 26 pendente" />
        </div>
      )}

      {exportando && licencas && (
        <ExportarLicencas
          licencas={filtradas}
          contexto={{ hoje, porId }}
          filtros={[
            `Setor: ${setor ? SETOR_LABEL[setor as keyof typeof SETOR_LABEL].toLowerCase() : 'todos'}.`,
            `Situação: ${FILTROS.find((f) => f.valor === filtro)?.rotulo.toLowerCase() ?? 'todas'}.`,
            ...(busca.trim() ? [`Busca: "${busca.trim()}".`] : []),
          ]}
          onFechar={() => setExportando(false)}
        />
      )}

      <section className="cartao">
        <div className="grid gap-3 border-b border-tinta-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input className={`${inputClass} sm:col-span-2 lg:col-span-4`} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar"
                 placeholder="Buscar por processo SEI, nº da licença, empresa ou rua" />
          <select className={inputClass} value={setor} onChange={(e) => setSetor(e.target.value)} aria-label="Setor">
            <option value="">Todos os setores</option>
            {SETORES.map((st) => <option key={st} value={st}>{SETOR_LABEL[st]}</option>)}
          </select>
          <select className={inputClass} value={intervencao} onChange={(e) => setIntervencao(e.target.value)} aria-label="Tipo de intervenção">
            <option value="">Obras e serviços</option>
            {TIPOS_INTERVENCAO.map((t) => <option key={t} value={t}>{TIPO_INTERVENCAO_LABEL[t]}s</option>)}
          </select>
          <select className={inputClass} value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem da intervenção">
            <option value="">Todas as origens</option>
            {ORIGENS.map((o) => <option key={o} value={o}>{ORIGEM_LABEL[o]}</option>)}
          </select>
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
              ? podeLicenciar ? 'Nenhuma licença registrada. Use Registrar licença para lançar a primeira.' : 'Nenhuma licença registrada.'
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
            <th className={tabela.th}>Início da obra ou serviço</th>
            <th className={tabela.th}>Fim da obra ou serviço</th>
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
                    {mesmaEmpresaNosPapeis(l)
                      ? <div className="text-xs text-tinta-500">própria contratante</div>
                      : nomeContr && <div className="text-xs text-tinta-500">para {nomeContr}</div>}
                  </td>
                )}
                <td className={tabela.td}>
                  {t1 ? <>{t1.logradouro}{t1.bairro && <span className="text-tinta-500">, {t1.bairro}</span>}</> : '—'}
                  <div className="text-xs text-tinta-500">
                    {TIPO_INTERVENCAO_LABEL[l.tipo_intervencao]}{origemPublica(l.origem_intervencao) ? ` pública (${ORIGEM_LABEL[l.origem_intervencao].toLowerCase()})` : ''} · {SETOR_LABEL[l.setor]}: {l.tipos_obra.map((t) => TIPO_OBRA_LABEL[t].toLowerCase()).join(', ')}
                    {resto.length > 0 && `; mais ${resto.length} trecho${resto.length > 1 ? 's' : ''}`}
                  </div>
                </td>
                <td className={`${tabela.td} tabular whitespace-nowrap text-xs text-tinta-700`}>
                  {l.inicio_previsto ? dataBR(l.inicio_previsto) : '—'}
                </td>
                <td className={`${tabela.td} tabular whitespace-nowrap text-xs text-tinta-700`}>
                  {l.fim_previsto ? dataBR(l.fim_previsto) : '—'}
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
export function LicencasDaEmpresa({ licencas, error, todas }: {
  licencas: LicencaComTrechos[] | null; error: unknown; todas: Empresa[];
}) {
  const porId = useMemo(() => new Map(todas.map((e) => [e.id, e])), [todas]);
  const hoje = hojeISO();
  return (
    <Card title={`Licenças de obra${licencas ? ` (${licencas.length})` : ''}`} semPadding>
      <ErrorNote error={error} />
      {!licencas && !error && <Spinner />}
      {licencas && licencas.length === 0 && <Empty>Nenhuma licença de obra com esta empresa.</Empty>}
      {licencas && licencas.length > 0 && <TabelaLicencas licencas={licencas} porId={porId} hoje={hoje} />}
    </Card>
  );
}

/**
 * Panorama da empresa (visão do gestor): desempenho em obras + o que precisa
 * de atenção + onde ela atua. Tudo derivado das licenças já carregadas.
 */
export function PanoramaEmpresa({ empresa, licencas }: { empresa: Empresa; licencas: LicencaComTrechos[] }) {
  const hoje = hojeISO();
  const d = useMemo(() => desempenhoExecutora(licencas, empresa.id, hoje), [licencas, empresa.id, hoje]);
  const pend = useMemo(() => pendenciasLicencas(licencas, hoje), [licencas, hoje]);
  const bairros = useMemo(() => contaBairros(licencas), [licencas]);
  const proximo = useMemo(() => proximoVencimento(licencas, hoje), [licencas, hoje]);
  if (d.obras === 0) return null;
  return (
    <>
      <DesempenhoCard d={d} />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <AtencaoCard pend={pend} />
        <OndeAtuaCard bairros={bairros} proximo={proximo} />
      </div>
    </>
  );
}

/** Concentração por bairro (top 4), a partir dos trechos das licenças. */
function contaBairros(licencas: LicencaComTrechos[]): [string, number][] {
  const m = new Map<string, number>();
  for (const l of licencas) {
    for (const t of l.licenca_trechos) {
      const b = t.bairro?.trim();
      if (b) m.set(b, (m.get(b) ?? 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
}

/** Licença ativa (em execução ou a começar) com o prazo mais próximo de vencer. */
function proximoVencimento(licencas: LicencaComTrechos[], hoje: string): LicencaComTrechos | null {
  return licencas
    .filter((l) => {
      const e = estadoLicenca(l, hoje);
      return (e === 'em_execucao' || e === 'aguardando_inicio') && Boolean(l.fim_previsto);
    })
    .sort((a, b) => (a.fim_previsto! < b.fim_previsto! ? -1 : 1))[0] ?? null;
}

function AtencaoCard({ pend }: { pend: ReturnType<typeof pendenciasLicencas> }) {
  const itens: { rot: string; n: number; tom: 'ruim' | 'alerta' }[] = [
    { rot: 'Fim da obra ou serviço vencido', n: pend.prazoEncerrado.length, tom: 'ruim' },
    { rot: 'Concluída sem As Built (art. 26)', n: pend.semAsBuilt.length, tom: 'alerta' },
    { rot: 'Pavimento sem recomposição', n: pend.semRecomposicao.length, tom: 'ruim' },
  ];
  const total = itens.reduce((s, i) => s + i.n, 0);
  return (
    <Card title="Precisa de atenção"
          action={<Badge tom={total ? 'ruim' : 'bom'}>{total ? `${total} ${total === 1 ? 'item' : 'itens'}` : 'Tudo em dia'}</Badge>}
          semPadding>
      <ul className="divide-y divide-tinta-100">
        {itens.map((i) => (
          <li key={i.rot} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className={`text-sm ${i.n ? 'text-tinta-800' : 'text-tinta-400'}`}>{i.rot}</span>
            <Badge tom={i.n ? i.tom : 'neutro'}>{i.n}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OndeAtuaCard({ bairros, proximo }: { bairros: [string, number][]; proximo: LicencaComTrechos | null }) {
  const max = bairros[0]?.[1] ?? 1;
  return (
    <Card title="Onde atua">
      {bairros.length === 0 ? (
        <p className="text-sm text-tinta-500">Nenhum trecho com bairro informado.</p>
      ) : (
        <ul className="space-y-2.5">
          {bairros.map(([b, n]) => (
            <li key={b} className="grid grid-cols-[6rem_1fr_1.5rem] items-center gap-3 text-sm">
              <span className="truncate text-tinta-600">{b}</span>
              <span className="h-2 rounded-full bg-marca-500" style={{ width: `${Math.max(8, (n / max) * 100)}%` }} aria-hidden />
              <span className="tabular text-right text-tinta-500">{n}</span>
            </li>
          ))}
        </ul>
      )}
      {proximo && (
        <p className="mt-4 border-t border-tinta-100 pt-3 text-sm text-tinta-500">
          Próximo prazo a vencer: <span className="font-mono text-tinta-700">nº {proximo.numero}</span> em{' '}
          <span className="font-mono text-tinta-700">{dataBR(proximo.fim_previsto)}</span>.
        </p>
      )}
    </Card>
  );
}

const NIVEL_DESEMPENHO: Record<NivelDesempenho, { rotulo: string; tom: 'bom' | 'alerta' | 'ruim' | 'neutro' }> = {
  bom: { rotulo: 'Bom', tom: 'bom' },
  alerta: { rotulo: 'Atenção', tom: 'alerta' },
  ruim: { rotulo: 'Crítico', tom: 'ruim' },
  sem_dados: { rotulo: 'Sem obras', tom: 'neutro' },
};

/** Percentual sobre uma base; '—' quando não há base. */
const pct = (parte: number, base: number) => (base === 0 ? '—' : `${Math.round((parte / base) * 100)}%`);

/** Scorecard de desempenho em obras da executora (visão do gestor). */
function DesempenhoCard({ d }: { d: Desempenho }) {
  const n = NIVEL_DESEMPENHO[d.nivel];
  return (
    <div className="mb-6">
    <Card title="Desempenho em obras"
          action={<Badge tom={n.tom}>{n.rotulo}</Badge>}>
      <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
        <Kpi rotulo="Obras (sob a Resolução)" valor={d.obras} detalhe={`${d.concluidas} concluída${d.concluidas === 1 ? '' : 's'}`} />
        <Kpi rotulo="Concluídas no prazo" valor={pct(d.noPrazo, d.concluidas)} detalhe="até o fim da obra ou serviço"
             tom={d.concluidas && d.noPrazo < d.concluidas ? 'baixa' : undefined} />
        <Kpi rotulo="Pavimento recomposto" valor={pct(d.recompostas, d.concluidas)} detalhe="das obras concluídas"
             tom={d.concluidas && d.recompostas < d.concluidas ? 'baixa' : undefined} />
        <Kpi rotulo="As Built entregue" valor={pct(d.comAsBuilt, d.concluidas)} detalhe="art. 26"
             tom={d.concluidas && d.comAsBuilt < d.concluidas ? 'baixa' : undefined} />
      </div>
      {d.atrasadas > 0 && (
        <p className="mt-4 text-sm text-baixa">
          {d.atrasadas} obra{d.atrasadas === 1 ? '' : 's'} com o fim da obra ou serviço vencido, sem conclusão.
        </p>
      )}
    </Card>
    </div>
  );
}
