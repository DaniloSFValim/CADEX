import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, ErrorNote, Spinner } from '../components/ui';
import { KpiCard, PageHeader } from '../components/Dashboard';
import { ExportarRelacao } from '../components/ExportarRelacao';
import { BARRA, SituacaoBadge } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj, onlyDigits } from '../lib/cnpj';
import {
  SITUACAO_LABEL, TIPO_LABEL, hojeISO, situacaoEfetiva, listarDocumentos, listarEmpresas, listarTiposDocumento, listarVinculos,
  nomeEmpresa, resumoDocumentos, type Documento, type Empresa, type Resumo, type SituacaoEfetiva, type TipoDocumento,
  type Vinculo,
} from '../lib/empresas';

export function ResumoBadge({ r }: { r: Resumo }) {
  if (r.vencidos > 0) return <Badge tom="ruim">{r.vencidos} vencido{r.vencidos > 1 ? 's' : ''}</Badge>;
  if (r.faltando > 0) return <Badge tom="alerta">{r.faltando} pendente{r.faltando > 1 ? 's' : ''}</Badge>;
  if (r.vencendo > 0) return <Badge tom="alerta">{r.vencendo} vence{r.vencendo > 1 ? 'm' : ''} em breve</Badge>;
  return <Badge tom="bom">Completa</Badge>;
}

export default function Empresas() {
  const { podeEditar } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    // O CISP não tem acesso a documentos: nem pede.
    Promise.all([
      listarEmpresas(),
      podeEditar ? listarTiposDocumento() : Promise.resolve([]),
      podeEditar ? listarDocumentos() : Promise.resolve([]),
      listarVinculos(),
    ])
      .then(([e, t, d, v]) => { setEmpresas(e); setTipos(t); setDocs(d); setVinculos(v); })
      .catch(setError);
  }, [podeEditar]);

  const hoje = hojeISO();

  const porId = useMemo(() => new Map((empresas ?? []).map((e) => [e.id, e])), [empresas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = onlyDigits(busca);
    const qCod = busca.trim().toUpperCase();
    return (empresas ?? []).filter((e) =>
      (!tipo || e.tipo === tipo)
      && (!situacao || situacaoEfetiva(e, hoje) === situacao)
      && (!q || e.razao_social.toLowerCase().includes(q)
          || (e.nome_fantasia ?? '').toLowerCase().includes(q)
          || e.codigo_cadex.includes(qCod)
          || (qDig.length >= 3 && e.cnpj.includes(qDig))));
  }, [empresas, busca, tipo, situacao, hoje]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Empresas"
        subtitle="Operadoras de telecomunicações e terceirizadas cadastradas no CADEX."
        actions={<>
          <button disabled={!empresas?.length} onClick={() => setExportando((x) => !x)}
            className="rounded border border-primary-500 px-4 py-2 text-sm font-semibold text-primary-500 hover:bg-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Exportar planilha
          </button>
          {podeEditar && <Link to="/empresas/nova"
            className="rounded bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors">
            + Nova empresa
          </Link>}
        </>}
      />

      {empresas && empresas.length > 0 && (() => {
        const sit = empresas.map((e) => situacaoEfetiva(e, hoje));
        const n = (f: (x: SituacaoEfetiva) => boolean) => sit.filter(f).length;
        const terceirizadas = empresas.filter((e) => e.tipo === 'terceirizada').length;
        const saneamento = n((x) => x === 'em_saneamento');
        const pendentes = podeEditar
          ? empresas.filter((e) => resumoDocumentos(tipos, docs.filter((d) => d.empresa_id === e.id), hoje).faltando > 0).length
          : null;
        return (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Cadastradas" value={empresas.length}
                 meta={`${empresas.length - terceirizadas} operadora${empresas.length - terceirizadas === 1 ? '' : 's'}, ${terceirizadas} terceirizada${terceirizadas === 1 ? '' : 's'}`} />
            <KpiCard label="Aptas" value={n((x) => x === 'apta' || x === 'em_saneamento')} variant="success"
                 meta={saneamento ? `${saneamento} em saneamento` : 'podem atuar'} />
            <KpiCard label="Em análise" value={n((x) => x === 'em_analise')} meta="aguardando decisão" />
            <KpiCard label="Impedidas" value={n((x) => x === 'inapta' || x === 'vencida' || x === 'indeferida')} variant="critical"
                 meta={pendentes !== null ? `${pendentes} com documentos pendentes` : 'inaptas, vencidas ou indeferidas'} />
          </div>
        );
      })()}

      {exportando && empresas && (
        <ExportarRelacao
          empresas={empresas}
          contexto={{
            hoje, porId, vinculos,
            resumoDocs: podeEditar
              ? (e) => resumoDocumentos(tipos, docs.filter((d) => d.empresa_id === e.id), hoje)
              : undefined,
          }}
          podeVerDocumentos={podeEditar}
          tipoInicial={tipo}
          situacaoInicial={situacao}
          onFechar={() => setExportando(false)}
        />
      )}

      <section>
        <div className="flex flex-wrap gap-3 rounded border border-tinta-200 bg-white p-4">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-2xs font-bold uppercase tracking-wider text-tinta-400">Buscar</label>
            <input className="rounded border border-tinta-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              placeholder="Nome, CNPJ ou código CADEX" value={busca}
              onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-2xs font-bold uppercase tracking-wider text-tinta-400">Tipo</label>
            <select className="rounded border border-tinta-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
              <option value="">Todos os tipos</option>
              <option value="operadora">Operadoras</option>
              <option value="terceirizada">Terceirizadas</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-2xs font-bold uppercase tracking-wider text-tinta-400">Situação</label>
            <select className="rounded border border-tinta-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
              <option value="">Todas as situações</option>
              {Object.entries(SITUACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <ErrorNote error={error} />
        {!empresas && !error && <Spinner />}
        {empresas && filtradas.length === 0 && (
          <Empty>{empresas.length === 0 ? 'Nenhuma empresa cadastrada. Use Nova empresa para cadastrar a primeira.' : 'Nenhuma empresa corresponde à busca.'}</Empty>
        )}

        {filtradas.length > 0 && (
          <div className="overflow-x-auto rounded border border-tinta-200 mt-4">
            <table className="w-full text-sm">
              <thead className="border-b-2 border-tinta-200 bg-tinta-50">
                <tr>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500 border-l-4 border-l-transparent">Empresa</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Código CADEX</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">CNPJ</th>
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Tipo</th>
                  {podeEditar && <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Documentação</th>}
                  <th className="px-4 py-3 text-left font-serif text-2xs font-bold uppercase tracking-wider text-tinta-500">Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((e) => {
                  const contratantes = vinculos
                    .filter((v) => v.contratada_id === e.id && !v.fim)
                    .map((v) => porId.get(v.contratante_id))
                    .filter((o): o is Empresa => Boolean(o));
                  const r = resumoDocumentos(tipos, docs.filter((d) => d.empresa_id === e.id), hoje);
                  return (
                    <tr key={e.id} className="border-b border-tinta-200 hover:bg-tinta-50 transition-colors">
                      <td className={`px-4 py-3 border-l-4 ${BARRA[situacaoEfetiva(e, hoje)]}`}>
                        <Link to={`/empresas/${e.id}`} className="font-medium text-tinta-900 hover:text-primary-600 hover:underline">
                          {nomeEmpresa(e)}
                        </Link>
                        {e.nome_fantasia && <div className="text-xs text-tinta-500">{e.razao_social}</div>}
                      </td>
                      <td className="px-4 py-3 tabular whitespace-nowrap text-xs text-tinta-700">{e.codigo_cadex}</td>
                      <td className="px-4 py-3 tabular whitespace-nowrap text-xs text-tinta-700">{formatCnpj(e.cnpj)}</td>
                      <td className="px-4 py-3">
                        {TIPO_LABEL[e.tipo]}
                        {contratantes.length > 0 && (
                          <div className="text-xs text-tinta-500">para {contratantes.map(nomeEmpresa).join(', ')}</div>
                        )}
                      </td>
                      {podeEditar && <td className="px-4 py-3"><ResumoBadge r={r} /></td>}
                      <td className="px-4 py-3"><SituacaoBadge s={situacaoEfetiva(e, hoje)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {empresas && empresas.length > 0 && (
          <div className="border-t border-tinta-200 px-4 py-2.5 text-xs text-tinta-500 mt-4">
            {filtradas.length} de {empresas.length} empresa{empresas.length === 1 ? '' : 's'}
          </div>
        )}
      </section>
    </div>
  );
}
