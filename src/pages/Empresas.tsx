import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Empty, ErrorNote, Spinner, inputClass } from '../components/ui';
import { ExportarRelacao } from '../components/ExportarRelacao';
import { SituacaoBadge } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj, onlyDigits } from '../lib/cnpj';
import {
  SITUACAO_LABEL, TIPO_LABEL, hojeISO, situacaoEfetiva, listarDocumentos, listarEmpresas, listarTiposDocumento, listarVinculos,
  nomeEmpresa, resumoDocumentos, type Documento, type Empresa, type Resumo, type TipoDocumento,
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
    <Card
      title={`Empresas${empresas ? ` (${filtradas.length})` : ''}`}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!empresas?.length} onClick={() => setExportando((x) => !x)}>
            Exportar
          </Button>
          {podeEditar && (
            <Link to="/empresas/nova"
                  className="rounded-md bg-marca-700 px-3 py-2 text-sm font-medium text-white hover:bg-marca-800">
              Nova empresa
            </Link>
          )}
        </div>
      }
    >
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
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input className={inputClass} placeholder="Buscar por nome, CNPJ ou código CADEX" value={busca}
               onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          <option value="operadora">Operadoras</option>
          <option value="terceirizada">Terceirizadas</option>
        </select>
        <select className={inputClass} value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
          <option value="">Todas as situações</option>
          {Object.entries(SITUACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <ErrorNote error={error} />
      {!empresas && !error && <Spinner />}
      {empresas && filtradas.length === 0 && (
        <Empty>{empresas.length === 0 ? 'Nenhuma empresa cadastrada ainda.' : 'Nenhuma empresa encontrada.'}</Empty>
      )}

      {filtradas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4">Empresa</th>
                <th className="py-2 pr-4">Código CADEX</th>
                <th className="py-2 pr-4">CNPJ</th>
                <th className="py-2 pr-4">Tipo</th>
                {podeEditar && <th className="py-2 pr-4">Documentação</th>}
                <th className="py-2">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.map((e) => {
                const contratantes = vinculos
                  .filter((v) => v.contratada_id === e.id && !v.fim)
                  .map((v) => porId.get(v.contratante_id))
                  .filter((o): o is Empresa => Boolean(o));
                const r = resumoDocumentos(tipos, docs.filter((d) => d.empresa_id === e.id), hoje);
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-4">
                      <Link to={`/empresas/${e.id}`} className="font-medium text-marca-700 hover:underline">
                        {nomeEmpresa(e)}
                      </Link>
                      {e.nome_fantasia && <div className="text-xs text-slate-500">{e.razao_social}</div>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs">{e.codigo_cadex}</td>
                    <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs">{formatCnpj(e.cnpj)}</td>
                    <td className="py-2 pr-4">
                      {TIPO_LABEL[e.tipo]}
                      {contratantes.length > 0 && (
                        <div className="text-xs text-slate-500">
                          para {contratantes.map(nomeEmpresa).join(', ')}
                        </div>
                      )}
                    </td>
                    {podeEditar && <td className="py-2 pr-4"><ResumoBadge r={r} /></td>}
                    <td className="py-2"><SituacaoBadge s={situacaoEfetiva(e, hoje)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
