import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, ErrorNote, Spinner, inputClass, tabela } from '../components/ui';
import { inconsistencias } from '../lib/admin';
import { hojeISO, listarEmpresas, type Empresa } from '../lib/empresas';
import { ESTADO_LICENCA_LABEL, estadoLicenca, listarLicencas, nomeExecutora, type LicencaComTrechos } from '../lib/licencas';

const MAX_BUSCA = 8;

/** Licenças na Administração: o que pede revisão e o caminho para o histórico de cada uma. */
export default function AdminLicencas() {
  const [licencas, setLicencas] = useState<LicencaComTrechos[] | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    Promise.all([listarLicencas(), listarEmpresas()])
      .then(([l, e]) => { setLicencas(l); setEmpresas(e); })
      .catch(setErro);
  }, []);

  const hoje = hojeISO();
  const porId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const revisar = useMemo(() => (licencas ? inconsistencias(licencas, hoje, porId) : []), [licencas, hoje, porId]);
  const achadas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q || !licencas) return [];
    return licencas.filter((l) => [l.numero ?? '', l.processo_sei, l.escopo].some((s) => s.toLowerCase().includes(q))).slice(0, MAX_BUSCA);
  }, [licencas, busca]);

  if (!licencas && !erro) return <Spinner />;
  if (!licencas) return <ErrorNote error={erro} />;

  return (
    <div className="flex flex-col gap-10">
      <Card title="Buscar uma licença">
        <input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar licença"
               placeholder="Nº da licença, processo SEI ou parte do escopo" />
        {busca.trim() !== '' && (achadas.length === 0
          ? <p className="mt-3 text-sm text-tinta-500">Nenhuma licença encontrada.</p>
          : (
            <ul className="mt-3 divide-y divide-tinta-100">
              {achadas.map((l) => <LinhaBusca key={l.id} licenca={l} porId={porId} hoje={hoje} />)}
            </ul>
          ))}
        <p className="mt-3 text-xs text-tinta-500">
          {licencas.length} licença{licencas.length === 1 ? '' : 's'} no CADEX. O histórico mostra quem alterou o quê e quando, direto da auditoria.
        </p>
      </Card>

      <Card title={`Registros a revisar (${revisar.length})`} semPadding>
        <p className="border-b border-tinta-100 px-4 py-3 text-sm text-tinta-500">
          Dado faltando, prazo vencido ou empresa que deixou de poder atuar. É um aviso: a correção é feita no próprio registro.
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

function LinhaBusca({ licenca: l, porId, hoje }: { licenca: LicencaComTrechos; porId: Map<string, Empresa>; hoje: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="font-medium text-tinta-900">{l.numero ?? 'Sem número'}</span>{' '}
        <span className="tabular text-xs text-tinta-500">{l.processo_sei}</span>
        <span className="block truncate text-xs text-tinta-500">{nomeExecutora(l, porId)}, {ESTADO_LICENCA_LABEL[estadoLicenca(l, hoje)].toLowerCase()}</span>
      </span>
      <span className="whitespace-nowrap">
        <Link to={`/obras/${l.id}`} className="font-semibold text-marca-700 hover:underline">Abrir</Link>
        <span className="mx-2 text-tinta-300" aria-hidden>|</span>
        <Link to={`/admin/auditoria?tabela=licencas&registro=${l.id}`} className="font-semibold text-marca-700 hover:underline">Histórico</Link>
      </span>
    </li>
  );
}
