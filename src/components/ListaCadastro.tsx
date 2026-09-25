import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Field, Spinner, inputClass } from './ui';
import { listarDaEmpresa, salvarDaEmpresa, type Registro, type Tabela } from '../lib/empresas';

export interface Campo {
  chave: string;
  rotulo: string;
  tipo?: 'texto' | 'data' | 'opcoes' | 'marcar';
  opcoes?: { valor: string; rotulo: string }[];
  /** Obrigatório sempre, ou conforme os outros valores. */
  obrigatorio?: boolean | ((todos: Record<string, unknown>) => boolean);
  dica?: string;
  largura?: 1 | 2 | 3;
  /** Formata enquanto digita (CPF, placa…). */
  mascara?: (v: string) => string;
  /** Mensagem de erro, ou null se o valor está bom. */
  validar?: (v: string, todos: Record<string, unknown>) => string | null;
  /** Mostra o campo só quando a condição vale. */
  quando?: (todos: Record<string, unknown>) => boolean;
  /** Como o valor aparece na lista. */
  exibir?: (r: Registro) => ReactNode;
}

const vazio = (campos: Campo[]) =>
  Object.fromEntries(campos.map((c) => [c.chave, c.tipo === 'marcar' ? false : c.opcoes?.[0]?.valor ?? '']));

/**
 * Lista de registros de uma empresa (responsáveis técnicos, pessoal,
 * veículos): o gestor inclui, edita e desativa; o CISP só consulta.
 * Nada é apagado: desativar mantém o histórico.
 */
export function ListaCadastro({
  titulo, tabela, empresaId, campos, resumo, podeEditar, preparar, vazioTexto,
}: {
  titulo: string;
  tabela: Tabela;
  empresaId: string;
  campos: Campo[];
  resumo: (r: Registro) => ReactNode;
  podeEditar: boolean;
  /** Ajusta os valores antes de gravar (tirar máscara, nulos…). */
  preparar?: (v: Record<string, unknown>) => Record<string, unknown>;
  vazioTexto: string;
}) {
  const [itens, setItens] = useState<Registro[] | null>(null);
  const [editando, setEditando] = useState<Registro | 'novo' | null>(null);
  const [v, setV] = useState<Record<string, unknown>>(vazio(campos));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [verInativos, setVerInativos] = useState(false);

  const recarregar = () => listarDaEmpresa(tabela, empresaId).then(setItens).catch(setError);
  useEffect(() => { void recarregar(); }, [tabela, empresaId]);

  const abrir = (r: Registro | 'novo') => {
    setError(null);
    setEditando(r);
    setV(r === 'novo'
      ? vazio(campos)
      : Object.fromEntries(campos.map((c) => [c.chave, r[c.chave] ?? (c.tipo === 'marcar' ? false : '')])));
  };

  const gravar = async (valores: Record<string, unknown>, id?: string) => {
    setBusy(true); setError(null);
    try {
      await salvarDaEmpresa(tabela, empresaId, valores, id);
      setEditando(null);
      await recarregar();
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  };

  const visiveis = (itens ?? []).filter((r) => verInativos || r.ativo);
  const inativos = (itens ?? []).filter((r) => !r.ativo).length;

  return (
    <Card
      title={`${titulo}${itens ? ` (${itens.filter((r) => r.ativo).length})` : ''}`}
      action={podeEditar && editando === null && (
        <Button variant="secondary" className="!py-1 text-xs" onClick={() => abrir('novo')}>Incluir</Button>
      )}
    >
      {editando !== null && (
        <form
          className="mb-4 grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            for (const c of campos) {
              if (c.quando && !c.quando(v)) continue;
              const val = String(v[c.chave] ?? '');
              const obrig = typeof c.obrigatorio === 'function' ? c.obrigatorio(v) : c.obrigatorio;
              if (obrig && c.tipo !== 'marcar' && !val.trim()) {
                setError(`Preencha: ${c.rotulo}.`); return;
              }
              const msg = val && c.validar?.(val, v);
              if (msg) { setError(msg); return; }
            }
            const limpo = Object.fromEntries(Object.entries(v).map(([k, x]) =>
              [k, typeof x === 'string' ? (x.trim() || null) : x]));
            void gravar(preparar ? preparar(limpo) : limpo, editando === 'novo' ? undefined : editando.id);
          }}
        >
          {campos.filter((c) => !c.quando || c.quando(v)).map((c) => {
            const span = { 1: 'sm:col-span-2', 2: 'sm:col-span-3', 3: 'sm:col-span-6' }[c.largura ?? 1];
            if (c.tipo === 'marcar') {
              return (
                <label key={c.chave} className={`flex items-center gap-2 text-sm text-slate-700 ${span}`}>
                  <input type="checkbox" checked={Boolean(v[c.chave])}
                         onChange={(e) => setV((s) => ({ ...s, [c.chave]: e.target.checked }))} />
                  {c.rotulo}
                </label>
              );
            }
            return (
              <Field key={c.chave} label={c.rotulo} hint={c.dica} className={span}
                     required={typeof c.obrigatorio === 'function' ? c.obrigatorio(v) : c.obrigatorio}>
                {c.tipo === 'opcoes' ? (
                  <select className={inputClass} value={String(v[c.chave] ?? '')}
                          onChange={(e) => setV((s) => ({ ...s, [c.chave]: e.target.value }))}>
                    {c.opcoes!.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                  </select>
                ) : (
                  <input className={inputClass} type={c.tipo === 'data' ? 'date' : 'text'}
                         value={String(v[c.chave] ?? '')}
                         onChange={(e) => setV((s) => ({
                           ...s, [c.chave]: c.mascara ? c.mascara(e.target.value) : e.target.value,
                         }))} />
                )}
              </Field>
            );
          })}
          <div className="flex flex-wrap gap-2 sm:col-span-6">
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
            <Button variant="secondary" onClick={() => { setEditando(null); setError(null); }}>Cancelar</Button>
          </div>
        </form>
      )}

      <ErrorNote error={error} />
      {!itens ? <Spinner /> : visiveis.length === 0 ? <Empty>{vazioTexto}</Empty> : (
        <ul className="divide-y divide-slate-100">
          {visiveis.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-start justify-between gap-2 py-2 text-sm ${r.ativo ? '' : 'opacity-60'}`}>
              <div className="min-w-0">{resumo(r)}</div>
              <div className="flex items-center gap-2">
                {!r.ativo && <Badge>Desativado</Badge>}
                {podeEditar && (
                  <>
                    <Button variant="secondary" className="!px-2 !py-1 text-xs" disabled={busy}
                            onClick={() => abrir(r)}>Editar</Button>
                    <Button variant="secondary" className="!px-2 !py-1 text-xs" disabled={busy}
                            onClick={() => void gravar({ ativo: !r.ativo }, r.id)}>
                      {r.ativo ? 'Desativar' : 'Reativar'}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {inativos > 0 && (
        <button type="button" className="mt-2 text-xs text-slate-500 underline"
                onClick={() => setVerInativos((x) => !x)}>
          {verInativos ? 'Ocultar desativados' : `Mostrar ${inativos} desativado${inativos > 1 ? 's' : ''}`}
        </button>
      )}
    </Card>
  );
}
