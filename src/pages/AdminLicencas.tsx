import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Card, Empty, ErrorNote, Spinner, inputClass, tabela } from '../components/ui';
import { ExcluirLicenca } from '../components/ExclusaoLicenca';
import { ExportarLicencas } from '../components/ExportarLicencas';
import { dataBR } from '../components/Situacao';
import { contagensLicencas, inconsistencias, type CategoriaProblema } from '../lib/admin';
import { hojeISO, listarEmpresas, type Empresa } from '../lib/empresas';
import {
  ESTADO_LICENCA_LABEL, buscarLicencasPagina, estadoLicenca, listarLicencas,
  cadastroRetroativo, nomeExecutora, prorrogarLicenca, rotuloProrrogacao, type LicencaComTrechos, type PaginaLicencas,
} from '../lib/licencas';
import { listarOrgaos, type Orgao } from '../lib/orgaos';

/** Sem busca, a lista mostra as licenças mais recentes; o resto aparece pela busca. */
const MAX_LISTA = 20;

/** Licenças na Administração: o que pede revisão e o caminho para o histórico de cada uma. */
export default function AdminLicencas() {
  const [licencas, setLicencas] = useState<LicencaComTrechos[] | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  // Vindo da exclusão feita na página da licença, já traz a mensagem.
  const [aviso, setAviso] = useState((useLocation().state as { aviso?: string } | null)?.aviso ?? '');
  const [busca, setBusca] = useState('');
  const [exportando, setExportando] = useState(false);
  // A lista da tela vem do servidor, uma página por vez. A revisão e a exportação usam o conjunto completo.
  const [lista, setLista] = useState<PaginaLicencas | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [erroLista, setErroLista] = useState<unknown>(null);

  const carregar = () => Promise.all([listarLicencas(), listarEmpresas(), listarOrgaos()])
    .then(([l, e, o]) => { setLicencas(l); setEmpresas(e); setOrgaos(o); })
    .catch(setErro);
  useEffect(() => { void carregar(); }, []);
  /** Depois de excluir, restaurar ou apagar: mostra o resultado e lê o banco de novo. */
  const mudou = (mensagem: string) => { setAviso(mensagem); void carregar(); };

  // Busca no servidor com pausa de 250 ms; refaz a lista quando a busca ou os dados mudam.
  useEffect(() => {
    if (!licencas) return;
    let vivo = true;
    const espera = setTimeout(() => {
      setCarregandoLista(true);
      buscarLicencasPagina(busca, 0, MAX_LISTA)
        .then((p) => { if (vivo) { setLista(p); setErroLista(null); } })
        .catch((e) => { if (vivo) setErroLista(e); })
        .finally(() => { if (vivo) setCarregandoLista(false); });
    }, 250);
    return () => { vivo = false; clearTimeout(espera); };
  }, [busca, licencas]);

  const mostrarMais = () => {
    if (!lista) return;
    setCarregandoLista(true);
    buscarLicencasPagina(busca, lista.itens.length, MAX_LISTA)
      .then((p) => { setLista({ total: p.total, itens: [...lista.itens, ...p.itens] }); setErroLista(null); })
      .catch(setErroLista)
      .finally(() => setCarregandoLista(false));
  };

  const hoje = hojeISO();
  const porId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const revisar = useMemo(() => (licencas ? inconsistencias(licencas, hoje, porId) : []), [licencas, hoje, porId]);
  const contagens = useMemo(() => (licencas ? contagensLicencas(licencas, hoje, porId) : null), [licencas, hoje, porId]);
  const rotuloAviso: Record<CategoriaProblema, string> = {
    processo_repetido: 'Processo SEI repetido', numero_fora_padrao: 'Número fora do padrão', prazo_longo: 'Prazo de mais de um ano',
    prazo_vencido: 'Fim vencido, sem conclusão', datas_incoerentes: 'Datas incoerentes com a validade', outros: 'Outros',
  };
  const q = busca.trim().toLowerCase();
  // Tudo o que a busca encontra; a tela mostra só o começo, mas a exportação sai com a lista inteira.
  const filtradas = useMemo(() => {
    if (!licencas) return [];
    if (!q) return licencas;
    return licencas.filter((l) => [l.numero ?? '', l.processo_sei, l.escopo].some((s) => s.toLowerCase().includes(q)));
  }, [licencas, q]);

  if (!licencas && !erro) return <Spinner />;
  if (!licencas) return <ErrorNote error={erro} />;

  return (
    <div className="flex flex-col gap-10">
      {aviso && <p role="status" className="rounded-sm border-l-4 border-alta bg-alta/6 px-3 py-2 text-sm text-tinta-800">{aviso}</p>}
      <Card title="Licenças no CADEX">
        <input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar licença"
               placeholder="Nº da licença, processo SEI ou parte do escopo" />
        {exportando && (
          <div className="mt-4">
            <ExportarLicencas
              licencas={filtradas}
              contexto={{ hoje, porId }}
              filtros={q ? [`Busca: "${busca.trim()}".`] : ['Todas as licenças.']}
              onFechar={() => setExportando(false)}
            />
          </div>
        )}
        {erroLista ? <ErrorNote error={erroLista} /> : null}
        {!lista ? <Spinner /> : lista.itens.length === 0
          ? <p className="mt-3 text-sm text-tinta-500">Nenhuma licença encontrada.</p>
          : (
            <ul className="mt-3 divide-y divide-tinta-100">
              {lista.itens.map((l) => <LinhaBusca key={l.id} licenca={l} porId={porId} orgaos={orgaos} hoje={hoje} onExcluida={mudou} />)}
            </ul>
          )}
        {lista && lista.itens.length < lista.total && (
          <div className="mt-3">
            <Button variant="secondary" disabled={carregandoLista} onClick={mostrarMais}>
              Mostrar mais ({lista.total - lista.itens.length} restantes)
            </Button>
          </div>
        )}
        <p className="mt-3 text-xs text-tinta-500">
          {licencas.length} licença{licencas.length === 1 ? '' : 's'} no CADEX{contagens ? `: ${contagens.porOrigem.novo} cadastrada${contagens.porOrigem.novo === 1 ? '' : 's'} aqui e ${contagens.porOrigem.anterior} já emitida${contagens.porOrigem.anterior === 1 ? '' : 's'} antes do CADEX` : ''}.
          {lista && (q ? ` ${lista.total} encontrada${lista.total === 1 ? '' : 's'} na busca.` : '')}
          {' '}<button type="button" className="text-marca-700 hover:underline" onClick={() => setExportando(true)}>Exportar a lista</button>.
          {' '}Lançada por engano? Use Excluir: ela vai para a lixeira, abaixo. O histórico mostra quem alterou o quê e quando, direto da auditoria.
        </p>
      </Card>

      <Card title={`Registros a revisar (${revisar.length})`} semPadding>
        <p className="border-b border-tinta-100 px-4 py-3 text-sm text-tinta-500">
          Dado faltando, prazo vencido, prazo de mais de um ano, número fora do padrão 000/AAAA ou empresa que deixou de poder atuar. É um aviso: a correção é feita no próprio registro, ou em lote na aba Manutenção.
          {contagens && Object.values(contagens.avisos).some((n) => n > 0) && (
            <> Avisos por tipo: {(Object.keys(rotuloAviso) as CategoriaProblema[]).filter((c) => contagens.avisos[c] > 0).map((c) => `${rotuloAviso[c].toLowerCase()} (${contagens.avisos[c]})`).join(', ')}.</>
          )}
        </p>
        {revisar.length === 0 ? <Empty>Nenhuma licença com pendência de revisão.</Empty> : (
          <div className={tabela.moldura}>
            <table className={tabela.tabela}>
              <thead className={tabela.cabeca}>
                <tr>
                  <th className={tabela.th}>Licença</th>
                  <th className={tabela.th}>O que revisar</th>
                  <th className={tabela.th}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {revisar.map(({ licenca: l, problemas }) => (
                  <tr key={l.id} className={tabela.linha}>
                    <td className={tabela.td}>
                      <Link to={`/obras/${l.id}`} className="font-medium text-tinta-900 hover:text-marca-700 hover:underline">{l.numero ?? 'Sem número'}</Link>
                      <div className="tabular text-xs text-tinta-500">{l.processo_sei}</div>
                      <div className="text-xs text-tinta-500">{nomeExecutora(l, porId)}, {ESTADO_LICENCA_LABEL[estadoLicenca(l, hoje)].toLowerCase()}</div>
                    </td>
                    <td className={tabela.td}>
                      <ul className="list-disc space-y-0.5 pl-4 text-sm text-tinta-700">
                        {problemas.map((m) => <li key={m}>{m}</li>)}
                      </ul>
                    </td>
                    <td className={`${tabela.td} whitespace-nowrap text-right text-sm`}>
                      <Link to={`/obras/${l.id}`} className="font-semibold text-marca-700 hover:underline">Abrir</Link>
                      <span className="mx-2 text-tinta-300" aria-hidden>|</span>
                      <Link to={`/admin/auditoria?tabela=licencas&registro=${l.id}`} className="font-semibold text-marca-700 hover:underline">Histórico</Link>
                      <div className="mt-2 flex justify-end">
                        <ExcluirLicenca licenca={l} empresas={porId} orgaos={orgaos} hoje={hoje} onExcluida={mudou} rotulo="Excluir" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>


    </div>
  );
}

function LinhaBusca({ licenca: l, porId, orgaos, hoje, onExcluida }: {
  licenca: LicencaComTrechos; porId: Map<string, Empresa>; orgaos: Orgao[]; hoje: string; onExcluida: (m: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="font-medium text-tinta-900">{l.numero ?? 'Sem número'}</span>{' '}
        {cadastroRetroativo(l) && (
          <span className="ml-1 rounded-sm bg-atencao/15 px-1.5 text-xs text-tinta-800" title="A conclusão foi registrada mais de 30 dias antes do cadastro.">Cadastro retroativo</span>
        )}{' '}
        <span className="tabular text-xs text-tinta-500">{l.processo_sei}</span>
        <span className="block truncate text-xs text-tinta-500">{nomeExecutora(l, porId)}, {ESTADO_LICENCA_LABEL[estadoLicenca(l, hoje)].toLowerCase()}</span>
      </span>
      <span className="whitespace-nowrap">
        <Link to={`/obras/${l.id}`} className="font-semibold text-marca-700 hover:underline">Abrir</Link>
        <span className="mx-2 text-tinta-300" aria-hidden>|</span>
        <Link to={`/admin/auditoria?tabela=licencas&registro=${l.id}`} className="font-semibold text-marca-700 hover:underline">Histórico</Link>
      </span>
      <ProrrogarLinha licenca={l} onMudou={onExcluida} />
      <details className="relative">
        <summary className="cursor-pointer list-none rounded px-2 py-1 text-sm font-semibold text-tinta-600 hover:bg-tinta-100 hover:text-tinta-900">Mais ações</summary>
        <div className="absolute right-0 z-10 mt-1 rounded-sm border border-tinta-200 bg-white p-2 shadow-md">
          <ExcluirLicenca licenca={l} empresas={porId} orgaos={orgaos} hoje={hoje} onExcluida={onExcluida} rotulo="Excluir" />
        </div>
      </details>
    </li>
  );
}

/** Prorroga a validade de uma licença, uma de cada vez. Só aparece quando a licença tem validade. */
function ProrrogarLinha({ licenca: l, onMudou }: { licenca: LicencaComTrechos; onMudou: (m: string) => void }) {
  const [data, setData] = useState(l.validade_ate ?? '');
  const [pedidoEmpresa, setPedidoEmpresa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  // Fechado por padrão: a lista fica de leitura e o formulário só aparece quando alguém pede.
  const [aberto, setAberto] = useState(false);
  if (!l.validade_ate) return null;
  const nome = l.numero ?? l.processo_sei;
  const salvar = async () => {
    setBusy(true);
    setErro(null);
    try {
      await prorrogarLicenca(l.id, data);
      setAberto(false);
      onMudou(`Validade de ${nome} prorrogada até ${dataBR(data)}.`);
    } catch (e) {
      setErro(e);
    } finally {
      setBusy(false);
    }
  };
  if (!aberto) {
    return (
      <span className="flex items-center gap-2 text-xs text-tinta-600">
        {l.prorrogacoes > 0 && <span className="font-semibold text-tinta-800">{rotuloProrrogacao(l.prorrogacoes)}</span>}
        <Button variant="secondary" className="px-3! py-1.5!" onClick={() => { setData(l.validade_ate ?? ''); setAberto(true); }}>
          Prorrogar
        </Button>
      </span>
    );
  }
  return (
    <span className="flex w-full flex-wrap items-center gap-2 rounded-sm bg-tinta-50 p-3 text-xs text-tinta-600">
      {l.prorrogacoes > 0 && <span className="font-semibold text-tinta-800">{rotuloProrrogacao(l.prorrogacoes)}</span>}
      <label className="flex items-center gap-1">
        Validade
        <input type="date" className={inputClass} value={data} onChange={(e) => setData(e.target.value)}
               aria-label={`Nova validade de ${nome}`} />
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={pedidoEmpresa} onChange={(e) => setPedidoEmpresa(e.target.checked)}
               aria-label={`Pedido da empresa para ${nome}`} />
        a pedido da empresa
      </label>
      <Button variant="secondary" disabled={busy || !data || !pedidoEmpresa || data === l.validade_ate} onClick={() => void salvar()}>Prorrogar</Button>
      {erro ? <ErrorNote error={erro} /> : null}
    </span>
  );
}
