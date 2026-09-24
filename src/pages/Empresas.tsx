import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Empty, ErrorNote, Spinner, inputClass } from '../components/ui';
import { formatCnpj, onlyDigits } from '../lib/cnpj';
import {
  TIPO_LABEL, hojeISO, listarDocumentos, listarEmpresas, listarTiposDocumento,
  nomeEmpresa, resumoDocumentos, type Documento, type Empresa, type Resumo, type TipoDocumento,
} from '../lib/empresas';

export function ResumoBadge({ r }: { r: Resumo }) {
  if (r.vencidos > 0) return <Badge tom="ruim">{r.vencidos} vencido{r.vencidos > 1 ? 's' : ''}</Badge>;
  if (r.faltando > 0) return <Badge tom="alerta">{r.faltando} pendente{r.faltando > 1 ? 's' : ''}</Badge>;
  if (r.vencendo > 0) return <Badge tom="alerta">{r.vencendo} vence{r.vencendo > 1 ? 'm' : ''} em breve</Badge>;
  return <Badge tom="bom">Completa</Badge>;
}

export default function Empresas() {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [situacao, setSituacao] = useState('ativa');

  useEffect(() => {
    Promise.all([listarEmpresas(), listarTiposDocumento(), listarDocumentos()])
      .then(([e, t, d]) => { setEmpresas(e); setTipos(t); setDocs(d); })
      .catch(setError);
  }, []);

  const porId = useMemo(() => new Map((empresas ?? []).map((e) => [e.id, e])), [empresas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = onlyDigits(busca);
    return (empresas ?? []).filter((e) =>
      (!tipo || e.tipo === tipo)
      && (!situacao || e.situacao === situacao)
      && (!q || e.razao_social.toLowerCase().includes(q)
          || (e.nome_fantasia ?? '').toLowerCase().includes(q)
          || (qDig.length >= 3 && e.cnpj.includes(qDig))));
  }, [empresas, busca, tipo, situacao]);

  const hoje = hojeISO();

  return (
    <Card
      title={`Empresas${empresas ? ` (${filtradas.length})` : ''}`}
      action={
        <Link to="/empresas/nova"
              className="rounded-md bg-gov-700 px-3 py-2 text-sm font-medium text-white hover:bg-gov-800">
          Nova empresa
        </Link>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input className={inputClass} placeholder="Buscar por nome ou CNPJ" value={busca}
               onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          <option value="operadora">Operadoras</option>
          <option value="terceirizada">Terceirizadas</option>
        </select>
        <select className={inputClass} value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
          <option value="ativa">Ativas</option>
          <option value="inativa">Inativas</option>
          <option value="">Todas</option>
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
                <th className="py-2 pr-4">CNPJ</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Documentação</th>
                <th className="py-2">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.map((e) => {
                const contratante = e.operadora_id ? porId.get(e.operadora_id) : undefined;
                const r = resumoDocumentos(tipos, docs.filter((d) => d.empresa_id === e.id), hoje);
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-4">
                      <Link to={`/empresas/${e.id}`} className="font-medium text-gov-700 hover:underline">
                        {nomeEmpresa(e)}
                      </Link>
                      {e.nome_fantasia && <div className="text-xs text-slate-500">{e.razao_social}</div>}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{formatCnpj(e.cnpj)}</td>
                    <td className="py-2 pr-4">
                      {TIPO_LABEL[e.tipo]}
                      {contratante && <div className="text-xs text-slate-500">de {nomeEmpresa(contratante)}</div>}
                    </td>
                    <td className="py-2 pr-4"><ResumoBadge r={r} /></td>
                    <td className="py-2">
                      <Badge tom={e.situacao === 'ativa' ? 'bom' : 'neutro'}>
                        {e.situacao === 'ativa' ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </td>
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
