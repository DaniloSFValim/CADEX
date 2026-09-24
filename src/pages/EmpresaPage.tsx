import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorNote, Field, Spinner, inputClass, type Tom } from '../components/ui';
import { formatCnpj, isValidCnpj, onlyDigits } from '../lib/cnpj';
import {
  ESTADO_LABEL, buscarEmpresa, criarEmpresa, enviarDocumento, estadoDocumento, hojeISO,
  linkDocumento, listarDocumentos, listarEmpresas, listarTiposDocumento, nomeEmpresa,
  removerDocumento, resumoDocumentos, salvarEmpresa, ultimoPorTipo,
  type Documento, type Empresa, type EmpresaInput, type EstadoDocumento, type TipoDocumento,
} from '../lib/empresas';
import { MAX_UPLOAD_BYTES } from '../lib/supabase';
import { ResumoBadge } from './Empresas';

const VAZIA: EmpresaInput = {
  cnpj: '', razao_social: '', nome_fantasia: '', tipo: 'operadora', operadora_id: null,
  email: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: 'Niterói', uf: 'RJ', situacao: 'ativa', observacoes: '',
};

const paraInput = (e: Empresa): EmpresaInput => ({
  cnpj: formatCnpj(e.cnpj), razao_social: e.razao_social, nome_fantasia: e.nome_fantasia ?? '',
  tipo: e.tipo, operadora_id: e.operadora_id, email: e.email, telefone: e.telefone ?? '',
  cep: e.cep ?? '', logradouro: e.logradouro ?? '', numero: e.numero ?? '',
  complemento: e.complemento ?? '', bairro: e.bairro ?? '', cidade: e.cidade ?? '',
  uf: e.uf ?? '', situacao: e.situacao, observacoes: e.observacoes ?? '',
});

export default function EmpresaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [operadoras, setOperadoras] = useState<Empresa[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setError(null);
    Promise.all([id ? buscarEmpresa(id) : Promise.resolve(null), listarEmpresas()])
      .then(([e, todas]) => {
        setEmpresa(e);
        setOperadoras(todas.filter((o) => o.tipo === 'operadora' && o.id !== id));
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (id && !empresa) return <ErrorNote error={error ?? 'Empresa não encontrada.'} />;

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-gov-700 hover:underline">← Empresas</Link>
      <h1 className="text-xl font-semibold text-slate-900">
        {empresa ? nomeEmpresa(empresa) : 'Nova empresa'}
      </h1>

      <Card title="Dados da empresa">
        <EmpresaForm
          key={empresa?.id ?? 'nova'}
          inicial={empresa ? paraInput(empresa) : VAZIA}
          editando={Boolean(empresa)}
          operadoras={operadoras}
          onSubmit={async (input) => {
            if (empresa) {
              await salvarEmpresa(empresa.id, input);
              setEmpresa(await buscarEmpresa(empresa.id));
            } else {
              const novo = await criarEmpresa(input);
              navigate(`/empresas/${novo}`, { replace: true });
            }
          }}
        />
      </Card>

      {empresa
        ? <Documentos empresa={empresa} />
        : <p className="text-sm text-slate-500">Depois de salvar os dados, você poderá anexar os documentos do art. 6º.</p>}
    </div>
  );
}

function EmpresaForm({
  inicial, editando, operadoras, onSubmit,
}: {
  inicial: EmpresaInput;
  editando: boolean;
  operadoras: Empresa[];
  onSubmit: (input: EmpresaInput) => Promise<void>;
}) {
  const [v, setV] = useState<EmpresaInput>(inicial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [salvo, setSalvo] = useState(false);

  const set = <K extends keyof EmpresaInput>(k: K, val: EmpresaInput[K]) => {
    setSalvo(false);
    setV((s) => ({ ...s, [k]: val }));
  };
  const text = (k: keyof EmpresaInput) => ({
    value: (v[k] as string | null) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
  });

  const cnpjCompleto = onlyDigits(v.cnpj).length === 14;
  const cnpjRuim = cnpjCompleto && !isValidCnpj(v.cnpj);

  return (
    <form
      className="grid gap-4 sm:grid-cols-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null); setSalvo(false);
        if (!editando && !isValidCnpj(v.cnpj)) { setError('CNPJ inválido.'); return; }
        if (v.tipo === 'terceirizada' && !v.operadora_id) {
          setError('Escolha a operadora que contratou a terceirizada.'); return;
        }
        setBusy(true);
        try { await onSubmit(v); setSalvo(true); }
        catch (err) { setError(err); }
        finally { setBusy(false); }
      }}
    >
      <Field label="CNPJ" required className="sm:col-span-2"
             hint={editando ? 'O CNPJ não pode ser alterado.' : undefined}>
        <input id="cnpj" className={inputClass} required disabled={editando} inputMode="numeric"
               placeholder="00.000.000/0000-00" value={v.cnpj}
               onChange={(e) => set('cnpj', formatCnpj(e.target.value))} />
        {cnpjRuim && <p className="mt-1 text-xs text-red-700">Dígito verificador não confere.</p>}
      </Field>
      <Field label="Razão social" required className="sm:col-span-4">
        <input id="razao" className={inputClass} required {...text('razao_social')} />
      </Field>
      <Field label="Nome fantasia" className="sm:col-span-3">
        <input id="fantasia" className={inputClass} {...text('nome_fantasia')} />
      </Field>
      <Field label="Tipo" required className="sm:col-span-3">
        <select id="tipo" className={inputClass} value={v.tipo}
                onChange={(e) => set('tipo', e.target.value as EmpresaInput['tipo'])}>
          <option value="operadora">Operadora de telecomunicações</option>
          <option value="terceirizada">Terceirizada</option>
        </select>
      </Field>
      {v.tipo === 'terceirizada' && (
        <Field label="Operadora contratante" required className="sm:col-span-6"
               hint={operadoras.length === 0 ? 'Cadastre a operadora antes da terceirizada.' : undefined}>
          <select id="operadora" className={inputClass} value={v.operadora_id ?? ''}
                  onChange={(e) => set('operadora_id', e.target.value || null)}>
            <option value="">Escolha…</option>
            {operadoras.map((o) => <option key={o.id} value={o.id}>{nomeEmpresa(o)}</option>)}
          </select>
        </Field>
      )}

      <Field label="E-mail" required className="sm:col-span-3">
        <input id="email" type="email" className={inputClass} required {...text('email')} />
      </Field>
      <Field label="Telefone" className="sm:col-span-3">
        <input id="telefone" className={inputClass} {...text('telefone')} />
      </Field>

      <Field label="CEP" className="sm:col-span-2">
        <input id="cep" className={inputClass} inputMode="numeric" {...text('cep')} />
      </Field>
      <Field label="Logradouro" className="sm:col-span-3">
        <input id="logradouro" className={inputClass} {...text('logradouro')} />
      </Field>
      <Field label="Número" className="sm:col-span-1">
        <input id="numero" className={inputClass} {...text('numero')} />
      </Field>
      <Field label="Complemento" className="sm:col-span-2">
        <input id="complemento" className={inputClass} {...text('complemento')} />
      </Field>
      <Field label="Bairro" className="sm:col-span-2">
        <input id="bairro" className={inputClass} {...text('bairro')} />
      </Field>
      <Field label="Cidade" className="sm:col-span-1">
        <input id="cidade" className={inputClass} {...text('cidade')} />
      </Field>
      <Field label="UF" className="sm:col-span-1">
        <input id="uf" className={inputClass} maxLength={2} {...text('uf')} />
      </Field>

      <Field label="Situação" className="sm:col-span-2">
        <select id="situacao" className={inputClass} value={v.situacao}
                onChange={(e) => set('situacao', e.target.value as EmpresaInput['situacao'])}>
          <option value="ativa">Ativa</option>
          <option value="inativa">Inativa</option>
        </select>
      </Field>
      <Field label="Observações" className="sm:col-span-4">
        <textarea id="observacoes" rows={2} className={inputClass} {...text('observacoes')} />
      </Field>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar empresa'}
        </Button>
        {salvo && editando && <span className="text-sm text-emerald-700">Alterações salvas.</span>}
      </div>
      <div className="sm:col-span-6"><ErrorNote error={error} /></div>
    </form>
  );
}

const TOM_ESTADO: Record<EstadoDocumento, Tom> = {
  pendente: 'alerta', ok: 'bom', vence_em_breve: 'alerta', vencido: 'ruim',
};

const dataBR = (iso: string) => iso.split('-').reverse().join('/');

function Documentos({ empresa }: { empresa: Empresa }) {
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const recarregar = () =>
    Promise.all([listarTiposDocumento(), listarDocumentos(empresa.id)])
      .then(([t, d]) => { setTipos(t); setDocs(d); })
      .catch(setError)
      .finally(() => setLoading(false));

  useEffect(() => { void recarregar(); }, [empresa.id]);

  const hoje = hojeISO();
  const ultimos = ultimoPorTipo(docs);

  return (
    <Card
      title="Documentos — art. 6º da Resolução Conjunta SECONSER/SEOP nº 001/2026"
      action={!loading && <ResumoBadge r={resumoDocumentos(tipos, docs, hoje)} />}
    >
      <ErrorNote error={error} />
      {loading ? <Spinner /> : (
        <ul className="divide-y divide-slate-100">
          {tipos.map((t) => (
            <LinhaDocumento
              key={t.codigo}
              empresaId={empresa.id}
              tipo={t}
              doc={ultimos.get(t.codigo)}
              estado={estadoDocumento(t, ultimos.get(t.codigo), hoje)}
              onChanged={recarregar}
            />
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-slate-500">
        Os incisos IV e V só se aplicam a quem tem infraestrutura própria ou contrato de
        compartilhamento; por isso não são obrigatórios. Se a SECONSER exigir declaração
        negativa de quem não os tem, é regra pendente de definição administrativa.
      </p>
    </Card>
  );
}

function LinhaDocumento({
  empresaId, tipo, doc, estado, onChanged,
}: {
  empresaId: string;
  tipo: TipoDocumento;
  doc: Documento | undefined;
  estado: EstadoDocumento;
  onChanged: () => Promise<void>;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [validade, setValidade] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [inputKey, setInputKey] = useState(0);

  const exibirEstado = estado === 'pendente' && !tipo.obrigatorio ? null : estado;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-slate-800">{tipo.nome}</div>
          <div className="text-xs text-slate-500">
            {tipo.fundamento} · {tipo.obrigatorio ? 'obrigatório' : 'quando aplicável'}
          </div>
        </div>
        {exibirEstado
          ? <Badge tom={TOM_ESTADO[exibirEstado]}>{ESTADO_LABEL[exibirEstado]}</Badge>
          : <Badge>Não enviado</Badge>}
      </div>

      {doc && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <button type="button" className="text-gov-700 underline hover:text-gov-900"
                  onClick={async () => {
                    setError(null);
                    try { window.open(await linkDocumento(doc), '_blank', 'noopener'); }
                    catch (err) { setError(err); }
                  }}>
            {doc.nome_arquivo}
          </button>
          {doc.validade && <span className="text-slate-600">válido até {dataBR(doc.validade)}</span>}
          <span className="text-xs text-slate-400">enviado em {new Date(doc.enviado_em).toLocaleDateString('pt-BR')}</span>
          <Button variant="danger" className="!px-2 !py-1 text-xs" disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(`Remover "${doc.nome_arquivo}"?`)) return;
                    setBusy(true); setError(null);
                    try { await removerDocumento(doc); await onChanged(); }
                    catch (err) { setError(err); }
                    finally { setBusy(false); }
                  }}>
            Remover
          </Button>
        </div>
      )}

      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!arquivo) { setError('Escolha o arquivo.'); return; }
          if (arquivo.size > MAX_UPLOAD_BYTES) { setError('Arquivo acima de 25 MB.'); return; }
          if (tipo.tem_validade && !validade) { setError('Informe a data de validade.'); return; }
          setBusy(true);
          try {
            await enviarDocumento(empresaId, tipo.codigo, arquivo, tipo.tem_validade ? validade : null);
            setArquivo(null); setValidade(''); setInputKey((k) => k + 1);
            await onChanged();
          } catch (err) { setError(err); }
          finally { setBusy(false); }
        }}
      >
        <input key={inputKey} type="file" aria-label={`Arquivo: ${tipo.nome}`}
               accept=".pdf,.jpg,.jpeg,.png,.zip,.kml,.kmz,.geojson"
               className="block max-w-full text-sm text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-sm"
               onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        {tipo.tem_validade && (
          <label className="text-xs text-slate-600">
            Validade
            <input type="date" className={`${inputClass} !py-1`} value={validade}
                   onChange={(e) => setValidade(e.target.value)} />
          </label>
        )}
        <Button type="submit" variant="secondary" className="!py-1" disabled={busy || !arquivo}>
          {busy ? 'Enviando…' : doc ? 'Substituir' : 'Enviar'}
        </Button>
      </form>
      <div className="mt-2"><ErrorNote error={error} /></div>
    </li>
  );
}
