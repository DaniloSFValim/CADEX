import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Empty, ErrorNote, Spinner, inputClass, tabela } from '../components/ui';
import {
  FILTRO_AUDITORIA_VAZIO, OPERACAO_LABEL, TABELA_AUDITORIA_LABEL, camposDoEvento, listarAuditoria, nomeTabela, registroValido,
  resumoEvento, valorParaTela, type EventoAuditoria, type FiltroAuditoria, type OperacaoAuditoria,
} from '../lib/auditoria';

const PAGINA = 50;
const TOM_OPERACAO: Record<OperacaoAuditoria, 'bom' | 'alerta' | 'ruim'> = { INSERT: 'bom', UPDATE: 'alerta', DELETE: 'ruim' };

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

/**
 * Auditoria: quem fez o quê e quando. O registro é gravado pelo banco, não se
 * altera nem se apaga, e só o gestor lê. Esta tela só consulta.
 * `?tabela=` e `?registro=` abrem já filtrados (o histórico de uma licença, por exemplo).
 */
export default function AdminAuditoria() {
  const [params] = useSearchParams();
  const inicial: FiltroAuditoria = {
    ...FILTRO_AUDITORIA_VAZIO,
    tabela: params.get('tabela') ?? '',
    registro: params.get('registro') ?? '',
  };
  const [filtro, setFiltro] = useState<FiltroAuditoria>(inicial);
  const [eventos, setEventos] = useState<EventoAuditoria[] | null>(null);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState<unknown>(null);
  const [carregando, setCarregando] = useState(false);

  const buscar = useCallback(async (f: FiltroAuditoria, desde: number, anexar: boolean) => {
    setCarregando(true);
    try {
      const r = await listarAuditoria(f, desde, PAGINA);
      setEventos((atuais) => (anexar && atuais ? [...atuais, ...r.eventos] : r.eventos));
      setTotal(r.total);
      setErro(null);
    } catch (e) {
      setErro(e);
      if (!anexar) setEventos([]);
    } finally { setCarregando(false); }
  }, []);

  // Refaz a busca quando o filtro muda (um instante depois da última tecla, para o nome não buscar a cada letra).
  useEffect(() => {
    const t = setTimeout(() => { void buscar(filtro, 0, false); }, 250);
    return () => clearTimeout(t);
  }, [filtro, buscar]);

  const set = <K extends keyof FiltroAuditoria>(k: K, v: FiltroAuditoria[K]) => setFiltro((f) => ({ ...f, [k]: v }));
  const filtrando = Object.values(filtro).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Filtros">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm font-medium text-tinta-700">O que mudou
            <select className={`${inputClass} mt-1`} value={filtro.tabela} onChange={(e) => set('tabela', e.target.value)}>
              <option value="">Tudo</option>
              {Object.entries(TABELA_AUDITORIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              {filtro.tabela && !(filtro.tabela in TABELA_AUDITORIA_LABEL) && <option value={filtro.tabela}>{filtro.tabela}</option>}
            </select>
          </label>
          <label className="block text-sm font-medium text-tinta-700">Operação
            <select className={`${inputClass} mt-1`} value={filtro.operacao} onChange={(e) => set('operacao', e.target.value as OperacaoAuditoria | '')}>
              <option value="">Todas</option>
              {(Object.keys(OPERACAO_LABEL) as OperacaoAuditoria[]).map((o) => <option key={o} value={o}>{OPERACAO_LABEL[o]}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-tinta-700">Quem fez (nome)
            <input className={`${inputClass} mt-1`} value={filtro.quem} onChange={(e) => set('quem', e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-tinta-700">De
            <input type="date" className={`${inputClass} mt-1`} value={filtro.de} max={filtro.ate || undefined} onChange={(e) => set('de', e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-tinta-700">Até
            <input type="date" className={`${inputClass} mt-1`} value={filtro.ate} min={filtro.de || undefined} onChange={(e) => set('ate', e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-tinta-700">Código do registro
            <input className={`${inputClass} tabular mt-1`} value={filtro.registro} onChange={(e) => set('registro', e.target.value)}
                   placeholder="Ex.: a licença que veio do botão Histórico" aria-invalid={!registroValido(filtro.registro)} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-tinta-600" role="status">
          {eventos && <span><strong className="text-tinta-900">{total}</strong> evento{total === 1 ? '' : 's'}{filtrando ? ' com estes filtros' : ''}</span>}
          {filtrando && <Button variant="secondary" className="px-3! py-1.5!" onClick={() => setFiltro(FILTRO_AUDITORIA_VAZIO)}>Limpar filtros</Button>}
        </div>
      </Card>

      <ErrorNote error={erro} />
      {!eventos && <Spinner />}
      {eventos && eventos.length === 0 && !erro && (
        <div className="cartao"><Empty>{filtrando ? 'Nenhum evento com estes filtros.' : 'Nenhum evento registrado ainda.'}</Empty></div>
      )}

      {eventos && eventos.length > 0 && (
        <div className={`cartao ${carregando ? 'opacity-70' : ''}`}>
          <div className={tabela.moldura}>
            <table className={tabela.tabela}>
              <thead className={tabela.cabeca}>
                <tr>
                  <th className={tabela.th}>Quando</th>
                  <th className={tabela.th}>Quem</th>
                  <th className={tabela.th}>O quê</th>
                  <th className={tabela.th}>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => <LinhaEvento key={e.id} evento={e} />)}
              </tbody>
            </table>
          </div>
          {eventos.length < total && (
            <div className="border-t border-tinta-100 p-3 text-center">
              <Button variant="secondary" disabled={carregando} onClick={() => void buscar(filtro, eventos.length, true)}>
                Mostrar mais ({total - eventos.length} restantes)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinhaEvento({ evento: e }: { evento: EventoAuditoria }) {
  const campos = camposDoEvento(e);
  return (
    <tr className={`${tabela.linha} align-top`}>
      <td className={`${tabela.td} tabular whitespace-nowrap text-xs text-tinta-600`}>{dataHora(e.em)}</td>
      <td className={tabela.td}>
        {e.por_nome ?? <span className="text-tinta-500">Banco de dados (sem usuário)</span>}
      </td>
      <td className={tabela.td}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tom={TOM_OPERACAO[e.operacao]}>{OPERACAO_LABEL[e.operacao]}</Badge>
          <span className="text-sm text-tinta-800">{nomeTabela(e.tabela)}</span>
        </div>
        {e.registro_id && <div className="tabular mt-0.5 text-xs text-tinta-400">{e.registro_id}</div>}
      </td>
      <td className={tabela.td}>
        <details>
          <summary className="cursor-pointer text-sm text-tinta-700">{resumoEvento(e)}</summary>
          <dl className="mt-2 space-y-1 text-xs">
            {campos.map((c) => (
              <div key={c.campo} className="grid grid-cols-[8rem_1fr] gap-2">
                <dt className="truncate font-medium text-tinta-600" title={c.campo}>{c.campo}</dt>
                <dd className="min-w-0 break-words text-tinta-800">
                  {e.operacao === 'UPDATE'
                    ? <><span className="text-tinta-500">{valorParaTela(c.antes)}</span> → <strong>{valorParaTela(c.depois)}</strong></>
                    : valorParaTela(e.operacao === 'INSERT' ? c.depois : c.antes)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </td>
    </tr>
  );
}
