import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Badge, Button, Card, Empty, ErrorNote, Spinner, inputClass, tabela } from '../components/ui';
import { ExcluirLicenca, ResumoLicenca } from '../components/ExclusaoLicenca';
import { ExportarLicencas } from '../components/ExportarLicencas';
import { dataBR } from '../components/Situacao';
import { inconsistencias } from '../lib/admin';
import { hojeISO, listarEmpresas, type Empresa } from '../lib/empresas';
import {
  ESTADO_LICENCA_LABEL, buscarLicencasPagina, estadoLicenca, excluirLicencaDefinitivamente, listarLicencas, listarLicencasExcluidas,
  cadastroRetroativo, nomeExecutora, prorrogarLicenca, rotuloProrrogacao, restaurarLicenca, type LicencaComTrechos, type PaginaLicencas,
} from '../lib/licencas';
import { listarContas, type Conta } from '../lib/contas';
import { listarOrgaos, type Orgao } from '../lib/orgaos';

/** Sem busca, a lista mostra as licenças mais recentes; o resto aparece pela busca. */
const MAX_LISTA = 20;

/** Licenças na Administração: o que pede revisão e o caminho para o histórico de cada uma. */
export default function AdminLicencas() {
  const [licencas, setLicencas] = useState<LicencaComTrechos[] | null>(null);
  const [lixeira, setLixeira] = useState<LicencaComTrechos[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  // Vindo da exclusão feita na página da licença, já traz a mensagem.
  const [aviso, setAviso] = useState((useLocation().state as { aviso?: string } | null)?.aviso ?? '');
  const [busca, setBusca] = useState('');
  const [exportando, setExportando] = useState(false);
  // A lista da tela vem do servidor, uma página por vez. A revisão e a exportação usam o conjunto completo.
  const [lista, setLista] = useState<PaginaLicencas | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [erroLista, setErroLista] = useState<unknown>(null);

  const carregar = () => Promise.all([listarLicencas(), listarLicencasExcluidas(), listarEmpresas(), listarOrgaos(), listarContas()])
    .then(([l, x, e, o, c]) => { setLicencas(l); setLixeira(x); setEmpresas(e); setOrgaos(o); setContas(c); })
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
          {licencas.length} licença{licencas.length === 1 ? '' : 's'} no CADEX.
          {lista && (q ? ` ${lista.total} encontrada${lista.total === 1 ? '' : 's'} na busca.` : '')}
          {' '}<button type="button" className="text-marca-700 hover:underline" onClick={() => setExportando(true)}>Exportar a lista</button>.
          {' '}Lançada por engano? Use Excluir: ela vai para a lixeira, abaixo. O histórico mostra quem alterou o quê e quando, direto da auditoria.
        </p>
      </Card>

      <Card title={`Registros a revisar (${revisar.length})`} semPadding>
        <p className="border-b border-tinta-100 px-4 py-3 text-sm text-tinta-500">
          Dado faltando, prazo vencido, prazo de mais de um ano, número fora do padrão 000/AAAA ou empresa que deixou de poder atuar. É um aviso: a correção é feita no próprio registro.
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

      <Card title={`Lixeira (${lixeira.length})`} semPadding>
        <p className="border-b border-tinta-100 px-4 py-3 text-sm text-tinta-500">
          Licenças excluídas. Ficam fora das listas, do painel, do mapa e da consulta pública. Restaurar devolve a licença como estava;
          apagar de vez remove a licença e os trechos, e o registro de auditoria permanece.
        </p>
        {lixeira.length === 0 ? <Empty>A lixeira está vazia.</Empty> : (
          <ul className="divide-y divide-tinta-100">
            {lixeira.map((l) => (
              <LinhaLixeira key={l.id} licenca={l} porId={porId} orgaos={orgaos} contas={contas} hoje={hoje} onMudou={mudou} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LinhaLixeira({ licenca: l, porId, orgaos, contas, hoje, onMudou }: {
  licenca: LicencaComTrechos; porId: Map<string, Empresa>; orgaos: Orgao[]; contas: Conta[]; hoje: string; onMudou: (m: string) => void;
}) {
  const [acao, setAcao] = useState<'' | 'apagar'>('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const quem = contas.find((c) => c.user_id === l.excluida_por);
  const nome = l.numero ?? l.processo_sei;

  const restaurar = async () => {
    setBusy(true); setErro(null);
    try { await restaurarLicenca(l.id); onMudou(`Licença ${nome} restaurada.`); }
    catch (e) { setErro(e); } finally { setBusy(false); }
  };
  const apagar = async () => {
    setBusy(true); setErro(null);
    try {
      const r = await excluirLicencaDefinitivamente(l.id);
      onMudou(`Licença ${nome} apagada definitivamente (${r.trechos_apagados} trecho${r.trechos_apagados === 1 ? '' : 's'}).`);
    } catch (e) { setErro(e); } finally { setBusy(false); }
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-medium text-tinta-900">{nome}</span>{' '}
          <Badge tom="alerta">Excluída</Badge>
          <div className="text-xs text-tinta-500">
            {l.excluida_em && dataBR(l.excluida_em.slice(0, 10))}, por {quem?.nome ?? quem?.email ?? 'outro administrador'}
            {l.excluida_motivo && <>: {l.excluida_motivo}</>}
          </div>
          <div className="text-xs text-tinta-500">{nomeExecutora(l, porId)}, {l.processo_sei}</div>
        </div>
        {acao === '' && (
          <div className="flex gap-2">
            <Button variant="secondary" className="px-3! py-1.5!" disabled={busy} onClick={() => void restaurar()}>Restaurar</Button>
            <Button variant="danger" className="px-3! py-1.5!" onClick={() => setAcao('apagar')}>Apagar de vez</Button>
          </div>
        )}
      </div>
      {acao === 'apagar' && (
        <div role="group" aria-label="Confirmar exclusão definitiva" className="max-w-xl rounded-sm border border-baixa/40 bg-baixa/4 p-4">
          <ResumoLicenca licenca={l} empresas={porId} orgaos={orgaos} hoje={hoje} />
          <p className="mt-3 text-tinta-700">
            Apaga a licença e {l.licenca_trechos.length} trecho{l.licenca_trechos.length === 1 ? '' : 's'}. Não dá para desfazer.
            O cadastro das empresas e o registro de auditoria não são apagados.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="px-3! py-1.5!" onClick={() => { setAcao(''); setErro(null); }}>Cancelar</Button>
            <Button variant="danger" className="px-3! py-1.5!" disabled={busy} onClick={() => void apagar()}>
              {busy ? 'Apagando…' : 'Apagar definitivamente'}
            </Button>
          </div>
        </div>
      )}
      <ErrorNote error={erro} />
    </li>
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
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  if (!l.validade_ate) return null;
  const nome = l.numero ?? l.processo_sei;
  const salvar = async () => {
    setBusy(true);
    setErro(null);
    try {
      await prorrogarLicenca(l.id, data);
      onMudou(`Validade de ${nome} prorrogada até ${dataBR(data)}.`);
    } catch (e) {
      setErro(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-tinta-600">
      {l.prorrogacoes > 0 && <span className="font-semibold text-tinta-800">{rotuloProrrogacao(l.prorrogacoes)}</span>}
      <label className="flex items-center gap-1">
        Validade
        <input type="date" className={inputClass} value={data} onChange={(e) => setData(e.target.value)}
               aria-label={`Nova validade de ${nome}`} />
      </label>
      <Button variant="secondary" disabled={busy || !data || data === l.validade_ate} onClick={() => void salvar()}>Prorrogar</Button>
      {erro ? <ErrorNote error={erro} /> : null}
    </span>
  );
}
