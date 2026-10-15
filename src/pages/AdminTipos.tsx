import { useEffect, useMemo, useState } from 'react';
import { Button, Card, ErrorNote, Field, Spinner, inputClass, tabela } from '../components/ui';
import { SETOR_LABEL, SETORES, type Setor } from '../lib/empresas';
import {
  SETORES_COM_CATALOGO_EDITAVEL, alterarTipo, codigoDeRotulo, incluirTipo, listarTipos, validarNovoTipo,
  type TipoIntervencao,
} from '../lib/tiposIntervencao';

/**
 * Tipos de obra e serviço por setor. A lista é do banco: incluir, renomear e
 * desativar valem para o formulário, a placa e o mapa. Código e setor não
 * mudam, para que o histórico continue apontando para o mesmo tipo.
 */
export default function AdminTipos() {
  const [tipos, setTipos] = useState<TipoIntervencao[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [setorFiltro, setSetorFiltro] = useState<Setor | ''>('');
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    listarTipos().then(setTipos).catch(setErro);
  }, [recarregar]);

  const visiveis = useMemo(
    () => (tipos ?? []).filter((t) => !setorFiltro || t.setor === setorFiltro),
    [tipos, setorFiltro],
  );

  if (!tipos && !erro) return <Spinner />;
  if (!tipos) return <ErrorNote error={erro} />;

  return (
    <div className="flex flex-col gap-10">
      <Card title="Tipos cadastrados" semPadding>
        <div className="flex flex-wrap items-end gap-3 border-b border-tinta-100 px-4 py-3">
          <Field label="Setor" className="min-w-56">
            <select className={inputClass} value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value as Setor | '')}>
              <option value="">Todos os setores</option>
              {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
            </select>
          </Field>
          <p className="max-w-prose text-sm text-tinta-500">
            Desativar tira o tipo das opções novas; registros que já usam o tipo continuam válidos.
            "Outros" não se desativa. Telecomunicações segue o art. 10 e não muda por aqui.
          </p>
        </div>
        <div className={tabela.moldura}>
          <table className={tabela.tabela}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.th}>Setor</th>
                <th className={tabela.th}>Nome</th>
                <th className={tabela.th}>Código</th>
                <th className={tabela.th}>Fonte</th>
                <th className={tabela.th}>Situação</th>
                <th className={`${tabela.th} text-right`}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((t) => (
                <LinhaTipo key={t.id} tipo={t} aoSalvar={() => setRecarregar((n) => n + 1)} />
              ))}
              {visiveis.length === 0 && (
                <tr><td colSpan={6} className={`${tabela.td} text-center text-tinta-500`}>Nenhum tipo neste setor.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <NovoTipoForm
        existentes={tipos}
        aoIncluir={() => setRecarregar((n) => n + 1)}
      />
    </div>
  );
}

function LinhaTipo({ tipo, aoSalvar }: { tipo: TipoIntervencao; aoSalvar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [rotulo, setRotulo] = useState(tipo.rotulo);
  const [fonte, setFonte] = useState(tipo.fonte);
  const [erro, setErro] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState(false);
  const fixo = tipo.codigo === 'outros' || tipo.setor === 'telecom';

  async function gravar(mudanca: Pick<TipoIntervencao, 'rotulo' | 'fonte' | 'ativo'>) {
    setOcupado(true);
    setErro(null);
    try {
      await alterarTipo(tipo.id, mudanca);
      setEditando(false);
      aoSalvar();
    } catch (e) {
      setErro(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <tr className={tabela.linha}>
      <td className={tabela.td}>{SETOR_LABEL[tipo.setor]}</td>
      <td className={`${tabela.td} font-medium text-tinta-900`}>
        {editando ? (
          <input className={inputClass} value={rotulo} onChange={(e) => setRotulo(e.target.value)} aria-label="Nome do tipo" />
        ) : tipo.rotulo}
      </td>
      <td className={`${tabela.td} font-mono text-xs text-tinta-600`}>{tipo.codigo}</td>
      <td className={`${tabela.td} text-xs text-tinta-600`}>
        {editando ? (
          <input className={inputClass} value={fonte} onChange={(e) => setFonte(e.target.value)} aria-label="Fonte do tipo" />
        ) : tipo.fonte}
        {erro ? <ErrorNote error={erro} /> : null}
      </td>
      <td className={tabela.td}>{tipo.ativo ? 'Ativo' : 'Desativado'}</td>
      <td className={`${tabela.td} text-right`}>
        <div className="flex justify-end gap-2">
          {editando ? (
            <>
              <Button variant="secondary" onClick={() => { setEditando(false); setRotulo(tipo.rotulo); setFonte(tipo.fonte); }}>Cancelar</Button>
              <Button disabled={ocupado} onClick={() => void gravar({ rotulo, fonte, ativo: tipo.ativo })}>Salvar</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditando(true)}>Editar</Button>
              {!fixo && (
                <Button variant={tipo.ativo ? 'danger' : 'secondary'} disabled={ocupado}
                        onClick={() => void gravar({ rotulo: tipo.rotulo, fonte: tipo.fonte, ativo: !tipo.ativo })}>
                  {tipo.ativo ? 'Desativar' : 'Reativar'}
                </Button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function NovoTipoForm({ existentes, aoIncluir }: { existentes: TipoIntervencao[]; aoIncluir: () => void }) {
  const [setor, setSetor] = useState<Setor>(SETORES_COM_CATALOGO_EDITAVEL[0]);
  const [rotulo, setRotulo] = useState('');
  const [fonte, setFonte] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState(false);

  const codigo = codigoDeRotulo(rotulo);
  const codigosDoSetor = existentes.filter((t) => t.setor === setor).map((t) => t.codigo);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const novo = { setor, codigo, rotulo, fonte };
    const falhas = validarNovoTipo(novo, codigosDoSetor);
    setErros(falhas);
    if (falhas.length) return;
    setOcupado(true);
    setErro(null);
    try {
      await incluirTipo(novo);
      setRotulo('');
      setFonte('');
      aoIncluir();
    } catch (err) {
      setErro(err);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card title="Incluir tipo">
      <form onSubmit={enviar} className="grid gap-5 sm:grid-cols-2">
        <Field label="Setor" required>
          <select className={inputClass} value={setor} onChange={(e) => setSetor(e.target.value as Setor)}>
            {SETORES_COM_CATALOGO_EDITAVEL.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Nome do tipo" required hint={codigo ? `Código: ${codigo}` : 'O código sai do nome e não muda depois.'}>
          <input className={inputClass} value={rotulo} onChange={(e) => setRotulo(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Fonte (ato ou processo que criou o tipo)" required className="sm:col-span-2"
               hint="Sem fonte, o tipo não entra. Ex.: número e data do ato, ou processo SEI.">
          <input className={inputClass} value={fonte} onChange={(e) => setFonte(e.target.value)} maxLength={500} />
        </Field>
        {erros.length > 0 && (
          <ul className="sm:col-span-2 list-disc pl-5 text-sm text-baixa">
            {erros.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
        {erro ? <div className="sm:col-span-2"><ErrorNote error={erro} /></div> : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={ocupado}>Incluir tipo</Button>
        </div>
      </form>
    </Card>
  );
}
