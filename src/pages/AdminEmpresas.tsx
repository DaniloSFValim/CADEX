import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Empty, ErrorNote, Spinner, inputClass, tabela } from '../components/ui';
import { SituacaoBadge } from '../components/Situacao';
import { duplicidades, participacoes, type Participacao } from '../lib/admin';
import { formatCnpj, onlyDigits } from '../lib/cnpj';
import {
  TIPO_LABEL, definirEmpresaAtiva, excluirEmpresa, hojeISO, listarEmpresas, nomeEmpresa, opcoesCadastro, situacaoEfetiva,
  type Empresa, type Tipo,
} from '../lib/empresas';
import { listarLicencas, type LicencaComTrechos } from '../lib/licencas';

const POR_PAGINA = 50;
const SEM_PARTICIPACAO: Participacao = { contratante: 0, executora: 0, subcontratada: 0, licencas: 0 };

/** Empresas na Administração: em quantas licenças cada uma atua, cadastros parecidos e ativar ou desativar. */
export default function AdminEmpresas() {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [licencas, setLicencas] = useState<LicencaComTrechos[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<Tipo | ''>('');
  const [cadastro, setCadastro] = useState<'todas' | 'ativas' | 'desativadas'>('todas');
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  const carregar = useCallback(async () => {
    try {
      const [e, l] = await Promise.all([listarEmpresas(), listarLicencas()]);
      setEmpresas(e); setLicencas(l); setErro(null);
    } catch (err) { setErro(err); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const part = useMemo(() => participacoes(licencas), [licencas]);
  const grupos = useMemo(() => duplicidades(empresas ?? []), [empresas]);
  const hoje = hojeISO();

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = onlyDigits(busca);
    return (empresas ?? []).filter((e) =>
      (!tipo || e.tipo === tipo)
      && (cadastro === 'todas' || (cadastro === 'ativas') === e.ativa)
      && (!q || e.razao_social.toLowerCase().includes(q) || (e.nome_fantasia ?? '').toLowerCase().includes(q)
          || e.codigo_cadex.toLowerCase().includes(q) || (qDig.length >= 3 && e.cnpj.includes(qDig))));
  }, [empresas, busca, tipo, cadastro]);

  if (!empresas && !erro) return <Spinner />;
  if (!empresas) return <ErrorNote error={erro} />;

  const desativadas = empresas.filter((e) => !e.ativa).length;

  return (
    <div className="flex flex-col gap-10">
      {aviso && (
        <div role="status" className="rounded-sm border-l-4 border-alta bg-alta/10 px-4 py-3 text-sm text-tinta-800">
          {aviso}
          <button type="button" className="ml-3 font-semibold text-marca-700 underline" onClick={() => setAviso(null)}>Fechar</button>
        </div>
      )}
      <ErrorNote error={erro} />

      <Card title={`Empresas (${filtradas.length}${filtradas.length !== empresas.length ? ` de ${empresas.length}` : ''})`} semPadding>
        <div className="grid gap-3 border-b border-tinta-200 p-4 sm:grid-cols-[1fr_220px_200px]">
          <input className={inputClass} value={busca} onChange={(e) => { setBusca(e.target.value); setMostrar(POR_PAGINA); }} aria-label="Buscar empresa"
                 placeholder="Nome, CNPJ ou código CADEX" />
          <select className={inputClass} value={tipo} onChange={(e) => { setTipo(e.target.value as Tipo | ''); setMostrar(POR_PAGINA); }} aria-label="Tipo de empresa">
            <option value="">Todos os tipos</option>
            {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
          </select>
          <select className={inputClass} value={cadastro} onChange={(e) => { setCadastro(e.target.value as typeof cadastro); setMostrar(POR_PAGINA); }} aria-label="Cadastro">
            <option value="todas">Ativas e desativadas</option>
            <option value="ativas">Só ativas</option>
            <option value="desativadas">Só desativadas{desativadas ? ` (${desativadas})` : ''}</option>
          </select>
        </div>
        {filtradas.length === 0 ? <Empty>Nenhuma empresa com estes filtros.</Empty> : (
          <div className={tabela.moldura}>
            <table className={tabela.tabela}>
              <thead className={tabela.cabeca}>
                <tr>
                  <th className={tabela.th}>Empresa</th>
                  <th className={tabela.th}>Inscrição</th>
                  <th className={tabela.th}>Participação nas licenças</th>
                  <th className={tabela.th}>Cadastro</th>
                  <th className={tabela.th}><span className="sr-only">Ação</span></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, mostrar).map((e) => (
                  <LinhaEmpresa key={e.id} empresa={e} hoje={hoje} participacao={part.get(e.id) ?? SEM_PARTICIPACAO}
                                onMudou={(msg) => { setAviso(msg); void carregar(); }} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtradas.length > mostrar && (
          <div className="border-t border-tinta-100 p-3 text-center">
            <Button variant="secondary" onClick={() => setMostrar((m) => m + POR_PAGINA)}>Mostrar mais ({filtradas.length - mostrar} restantes)</Button>
          </div>
        )}
      </Card>

      <Card title={`Cadastros que podem ser a mesma empresa (${grupos.length})`}>
        {grupos.length === 0 ? (
          <p className="text-sm text-tinta-600">Nenhum nome repetido nem raiz de CNPJ em comum entre os cadastros.</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-tinta-600">
              O CNPJ completo já é único no banco. Estes passaram por ele: nome escrito de outro jeito, ou matriz e filiais da mesma raiz de CNPJ.
              Filial é legítima; confira antes de tratar como duplicidade.
            </p>
            <ul className="space-y-3">
              {grupos.map((g) => (
                <li key={`${g.motivo}:${g.chave}`} className="rounded-sm border border-tinta-200 p-3">
                  <div className="text-xs font-medium text-tinta-500">
                    {g.motivo === 'nome' ? 'Mesmo nome' : 'Mesma raiz de CNPJ (matriz e filiais)'}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {g.empresas.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-baseline gap-x-3">
                        <Link to={`/empresas/${e.id}`} className="font-medium text-tinta-900 hover:underline">{nomeEmpresa(e)}</Link>
                        <span className="tabular text-tinta-500">{formatCnpj(e.cnpj)}</span>
                        <span className="text-tinta-500">{e.codigo_cadex}</span>
                        {!e.ativa && <Badge>Desativada</Badge>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function LinhaEmpresa({ empresa: e, hoje, participacao: p, onMudou }: {
  empresa: Empresa; hoje: string; participacao: Participacao; onMudou: (msg: string) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [cnpjDigitado, setCnpjDigitado] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const opc = opcoesCadastro(e, p.licencas);

  const alternar = async () => {
    setBusy(true); setErro(null);
    try {
      await definirEmpresaAtiva(e.id, !e.ativa);
      setConfirmando(false);
      onMudou(e.ativa ? `Cadastro de ${nomeEmpresa(e)} desativado.` : `Cadastro de ${nomeEmpresa(e)} reativado.`);
    } catch (err) { setErro(err); } finally { setBusy(false); }
  };

  const excluir = async () => {
    setBusy(true); setErro(null);
    try {
      await excluirEmpresa(e);
      setExcluindo(false);
      onMudou(`Cadastro de ${nomeEmpresa(e)} excluído, com os documentos e arquivos.`);
    } catch (err) { setErro(err); } finally { setBusy(false); }
  };

  return (
    <tr className={tabela.linha}>
      <td className={tabela.td}>
        <Link to={`/empresas/${e.id}`} className="font-medium text-tinta-900 hover:text-marca-700 hover:underline">{nomeEmpresa(e)}</Link>
        <div className="text-xs text-tinta-500">
          <span className="tabular">{formatCnpj(e.cnpj)}</span>, {e.codigo_cadex}, {TIPO_LABEL[e.tipo].toLowerCase()}
        </div>
      </td>
      <td className={tabela.td}><SituacaoBadge s={situacaoEfetiva(e, hoje)} /></td>
      <td className={`${tabela.td} text-sm`}>
        {p.licencas === 0 ? <span className="text-tinta-500">Sem licenças</span> : (
          <>
            <strong>{p.licencas}</strong> licença{p.licencas === 1 ? '' : 's'}
            <div className="text-xs text-tinta-500">
              {[p.contratante > 0 && `${p.contratante} como contratante`, p.executora > 0 && `${p.executora} como executora`,
                p.subcontratada > 0 && `${p.subcontratada} como subcontratada`].filter(Boolean).join(', ')}
            </div>
          </>
        )}
      </td>
      <td className={tabela.td}>{e.ativa ? <Badge tom="bom">Ativa</Badge> : <Badge tom="alerta">Desativada</Badge>}</td>
      <td className={`${tabela.td} min-w-[220px] text-right`}>
        {excluindo ? (
          <div className="flex flex-col items-end gap-2 text-right text-sm">
            <span className="text-tinta-700">
              Apaga o cadastro, documentos, vínculos, responsáveis técnicos, funcionários e veículos. A exclusão fica na auditoria.
            </span>
            <label className="w-full text-left text-xs text-tinta-600">
              Digite o CNPJ ({formatCnpj(e.cnpj)}) para confirmar
              <input className={`${inputClass} mt-1 tabular`} inputMode="numeric" value={cnpjDigitado}
                     onChange={(ev) => setCnpjDigitado(ev.target.value)} />
            </label>
            <div className="flex gap-2">
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => { setExcluindo(false); setCnpjDigitado(''); }}>Cancelar</Button>
              <Button variant="danger" className="px-3! py-1.5!"
                      disabled={busy || onlyDigits(cnpjDigitado) !== e.cnpj}
                      onClick={() => void excluir()}>
                {busy ? 'Excluindo…' : 'Excluir'}
              </Button>
            </div>
          </div>
        ) : !confirmando ? (
          <div className="flex flex-wrap justify-end gap-2">
            {opc.desativar && (
              <Button variant="danger" className="px-3! py-1.5!" onClick={() => setConfirmando(true)}>Desativar</Button>
            )}
            {opc.reativar && (
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => setConfirmando(true)}>Reativar</Button>
            )}
            {opc.excluir && (
              <Button variant="danger" className="px-3! py-1.5!" onClick={() => setExcluindo(true)}>Excluir</Button>
            )}
            {!opc.excluir && opc.motivoSemExclusao && (
              <span className="self-center text-xs text-tinta-500">{opc.motivoSemExclusao}</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-2 text-right text-sm">
            <span className="text-tinta-700">
              {e.ativa
                ? 'Deixa de poder ser escolhida em licença nova. As licenças existentes, o histórico e a consulta pública não mudam.'
                : 'Volta a poder ser escolhida em licença nova.'}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => setConfirmando(false)}>Cancelar</Button>
              <Button variant={e.ativa ? 'danger' : 'primary'} className="px-3! py-1.5!" disabled={busy} onClick={() => void alternar()}>
                {busy ? 'Salvando…' : 'Confirmar'}
              </Button>
            </div>
          </div>
        )}
        <ErrorNote error={erro} />
      </td>
    </tr>
  );
}
