import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, Empty, ErrorNote, Spinner, Titulo, inputClass } from '../components/ui';
import { useAuth } from '../lib/auth';
import { buscarEmpresa, type Empresa } from '../lib/empresas';
import {
  CAMPOS_DOCUMENTO, TIPOS_DOCUMENTO, TITULO_DOCUMENTO, autuadoDoCadastro, codigoLegivel, emitirDocumento,
  listarDocumentosDaEmpresa, montarDados, numeroDocumento, validarDados, type CampoDocumento, type DocumentoOficial,
  type TipoDocumento,
} from '../lib/documentos';
import { gerarPdfDocumento } from '../lib/documentosPdf';

/** Documentos oficiais de uma empresa: emissão (só gestor) e lista com o PDF de cada um. */
export default function Documentos() {
  const { id } = useParams();
  const { podeEditar } = useAuth();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [emitidos, setEmitidos] = useState<DocumentoOficial[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  const carregar = async () => {
    if (!id) return;
    const [e, docs] = await Promise.all([buscarEmpresa(id), listarDocumentosDaEmpresa(id)]);
    setEmpresa(e);
    setEmitidos(docs);
  };

  useEffect(() => {
    if (!podeEditar) return;
    carregar().catch(setErro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, podeEditar]);

  if (!podeEditar) return <Empty>Só a SECONSER emite documentos oficiais.</Empty>;
  if (erro) return <ErrorNote error={erro} />;
  if (!empresa || !emitidos) return <Spinner />;

  return (
    <div className="flex flex-col gap-8">
      <Titulo
        titulo="Documentos oficiais"
        descricao={`${empresa.razao_social} · ${empresa.codigo_cadex}. Cada documento recebe um número próprio da fiscalização e não pode ser alterado depois de emitido.`}
      />
      <Link to={`/empresas/${empresa.id}`} className="text-sm font-semibold text-marca-700 hover:underline">Voltar à empresa</Link>

      <Emissao empresa={empresa} onEmitido={carregar} />

      <Card title={`Emitidos (${emitidos.length})`} semPadding>
        {emitidos.length === 0 ? <Empty>Nenhum documento emitido para esta empresa.</Empty> : (
          <ul className="divide-y divide-tinta-100">
            {emitidos.map((d) => <LinhaEmitido key={d.id} documento={d} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Emissao({ empresa, onEmitido }: { empresa: Empresa; onEmitido: () => Promise<void> }) {
  const [tipo, setTipo] = useState<TipoDocumento>('notificacao');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [confirmado, setConfirmado] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const trocarTipo = (t: TipoDocumento) => {
    setTipo(t);
    setCampos({});
    setConfirmado(false);
    setErros([]);
    setResultado(null);
  };

  const emitir = async () => {
    const problemas = validarDados(tipo, campos);
    setErros(problemas);
    if (problemas.length > 0) return;
    setBusy(true);
    setErro(null);
    try {
      const dados = montarDados(tipo, campos, autuadoDoCadastro(empresa, empresa.situacao));
      const r = await emitirDocumento(tipo, empresa.id, dados);
      setResultado(`${TITULO_DOCUMENTO[tipo]} emitido: documento nº ${numeroDocumento(r.numero)}. Código de verificação ${codigoLegivel(r.codigo_verificacao)}.`);
      setCampos({});
      setConfirmado(false);
      await onEmitido();
    } catch (e) {
      setErro(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Emitir documento">
      <div role="tablist" aria-label="Tipo de documento" className="flex flex-wrap gap-2">
        {TIPOS_DOCUMENTO.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tipo} onClick={() => trocarTipo(t)}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${
                    t === tipo ? 'bg-marca-700 text-white' : 'bg-tinta-100 text-tinta-800 hover:bg-tinta-200'}`}>
            {TITULO_DOCUMENTO[t]}
          </button>
        ))}
      </div>

      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void emitir(); }}>
        {CAMPOS_DOCUMENTO[tipo].map((c) => (
          <CampoForm key={c.chave} campo={c} valor={campos[c.chave] ?? ''}
                     onChange={(v) => setCampos((s) => ({ ...s, [c.chave]: v }))} />
        ))}

        <div className="sm:col-span-2 rounded-lg bg-tinta-50 p-4 text-sm text-tinta-700">
          <p className="font-semibold text-tinta-900">Autuado (cadastro da empresa)</p>
          <p className="mt-1">{empresa.razao_social} · {empresa.cnpj}</p>
          <p>{[empresa.logradouro, empresa.numero].filter(Boolean).join(', ')} {empresa.bairro ? `- ${empresa.bairro}` : ''} · {empresa.cidade ?? '—'}/{empresa.uf ?? '—'}</p>
        </div>

        {erros.length > 0 && (
          <ul role="alert" className="sm:col-span-2 list-disc space-y-1 pl-5 text-sm text-baixa">
            {erros.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}

        <label className="sm:col-span-2 flex items-start gap-2 text-sm text-tinta-800">
          <input type="checkbox" className="mt-1" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
          <span>Conferi os dados. Depois de emitido, o documento não pode ser alterado: uma correção gera outro número.</span>
        </label>

        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!confirmado || busy}>{busy ? 'Emitindo…' : `Emitir ${TITULO_DOCUMENTO[tipo].toLowerCase()}`}</Button>
          {resultado && <p role="status" className="text-sm font-semibold text-alta">{resultado}</p>}
        </div>
        <div className="sm:col-span-2"><ErrorNote error={erro} /></div>
      </form>
    </Card>
  );
}

function CampoForm({ campo, valor, onChange }: { campo: CampoDocumento; valor: string; onChange: (v: string) => void }) {
  const id = `doc-${campo.chave}`;
  const largo = campo.tipo === 'area';
  const rotulo = (
    <label htmlFor={id} className="mb-1 block text-sm font-semibold text-tinta-800">
      {campo.rotulo}{campo.obrigatorio && <span className="text-baixa"> *</span>}
    </label>
  );
  let controle;
  if (campo.tipo === 'area') {
    controle = <textarea id={id} rows={4} className={inputClass} value={valor} onChange={(e) => onChange(e.target.value)} />;
  } else if (campo.tipo === 'selecao') {
    controle = (
      <select id={id} className={inputClass} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Escolha…</option>
        {campo.opcoes?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (campo.tipo === 'dinheiro') {
    controle = <input id={id} className={inputClass} inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const tipoInput = campo.tipo === 'data' ? 'date' : campo.tipo === 'hora' ? 'time' : 'text';
    controle = <input id={id} type={tipoInput} className={inputClass} value={valor} onChange={(e) => onChange(e.target.value)} />;
  }
  return <div className={largo ? 'sm:col-span-2' : ''}>{rotulo}{controle}</div>;
}

function LinhaEmitido({ documento }: { documento: DocumentoOficial }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  const baixar = async () => {
    setBusy(true);
    setErro(null);
    try {
      const logo = await lerLogo();
      const bytes = await gerarPdfDocumento(documento, logo);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documento.tipo}-${String(documento.numero).padStart(3, '0')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErro(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <span className="font-semibold text-tinta-900">{TITULO_DOCUMENTO[documento.tipo]}</span>{' '}
        <span className="tabular text-tinta-600">nº {numeroDocumento(documento.numero)}</span>
        <div className="text-xs text-tinta-500">Código {codigoLegivel(documento.codigo_verificacao)}</div>
        <ErrorNote error={erro} />
      </div>
      <Button variant="secondary" className="px-3! py-1.5!" disabled={busy} onClick={() => void baixar()}>
        {busy ? 'Gerando…' : 'Baixar PDF'}
      </Button>
    </li>
  );
}

/** Brasão para o cabeçalho do PDF, como data URL. Se falhar, o PDF sai sem ele. */
async function lerLogo(): Promise<string | undefined> {
  try {
    const r = await fetch('/logo-prefeitura-seconser.png');
    if (!r.ok) return undefined;
    const blob = await r.blob();
    return await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = () => reject(leitor.error);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}
