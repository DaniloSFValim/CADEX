import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorNote, Field, Spinner, inputClass, type Tom } from '../components/ui';
import { SituacaoBadge } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj, isValidCnpj, onlyDigits } from '../lib/cnpj';
import {
  ESTADO_LABEL, TIPO_LABEL, TIPO_RESOLUCAO, buscarEmpresa, criarEmpresa, criarVinculo, definirFimVinculo,
  enviarDocumento, estadoDocumento, hojeISO, linkDocumento, listarDocumentos, listarEmpresas,
  listarTiposDocumento, listarVinculos, nomeEmpresa, removerDocumento, resumoDocumentos,
  salvarEmpresa, situacaoEfetiva, ultimoPorTipo,
  type Documento, type Empresa, type EmpresaInput, type EstadoDocumento, type TipoDocumento,
  type Vinculo,
} from '../lib/empresas';
import { MAX_UPLOAD_BYTES } from '../lib/supabase';
import { ResumoBadge } from './Empresas';
import { Inscricao } from './Inscricao';
import { Operacional } from './Operacional';

const VAZIA: EmpresaInput = {
  cnpj: '', razao_social: '', nome_fantasia: '', tipo: 'operadora',
  email: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: 'Niterói', uf: 'RJ', observacoes: '',
};

const paraInput = (e: Empresa): EmpresaInput => ({
  cnpj: formatCnpj(e.cnpj), razao_social: e.razao_social, nome_fantasia: e.nome_fantasia ?? '',
  tipo: e.tipo, email: e.email, telefone: e.telefone ?? '',
  cep: e.cep ?? '', logradouro: e.logradouro ?? '', numero: e.numero ?? '',
  complemento: e.complemento ?? '', bairro: e.bairro ?? '', cidade: e.cidade ?? '',
  uf: e.uf ?? '', observacoes: e.observacoes ?? '',
});

export default function EmpresaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { podeEditar } = useAuth();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [todas, setTodas] = useState<Empresa[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setError(null);
    Promise.all([id ? buscarEmpresa(id) : Promise.resolve(null), listarEmpresas()])
      .then(([e, lista]) => { setEmpresa(e); setTodas(lista); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (id && !empresa) return <ErrorNote error={error ?? 'Empresa não encontrada.'} />;
  if (!id && !podeEditar) return <ErrorNote error="Seu perfil é só de consulta." />;

  const recarregar = async () => { if (empresa) setEmpresa(await buscarEmpresa(empresa.id)); };
  const operadoras = todas.filter((o) => o.tipo === 'operadora');

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-gov-700 hover:underline">← Empresas</Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {empresa ? nomeEmpresa(empresa) : 'Nova empresa'}
        </h1>
        {empresa && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-mono font-semibold text-gov-800">{empresa.codigo_cadex}</span>
            <span>· {TIPO_LABEL[empresa.tipo]} ({TIPO_RESOLUCAO[empresa.tipo]})</span>
            <SituacaoBadge s={situacaoEfetiva(empresa, hojeISO())} />
          </p>
        )}
      </div>

      <Card title="Dados da empresa">
        <EmpresaForm
          key={empresa?.id ?? 'nova'}
          inicial={empresa ? paraInput(empresa) : VAZIA}
          editando={Boolean(empresa)}
          somenteLeitura={!podeEditar}
          operadoras={operadoras}
          onSubmit={async (input, contratantes) => {
            if (empresa) {
              await salvarEmpresa(empresa.id, input);
              setEmpresa(await buscarEmpresa(empresa.id));
            } else {
              const novo = await criarEmpresa(input, contratantes);
              navigate(`/empresas/${novo}`, { replace: true });
            }
          }}
        />
      </Card>

      {empresa && <Inscricao empresa={empresa} podeEditar={podeEditar} onSalvo={recarregar} />}

      {empresa && <Vinculos empresa={empresa} todas={todas} podeEditar={podeEditar} />}

      {empresa && <Operacional empresa={empresa} operadoras={operadoras} podeEditar={podeEditar} />}

      {/* Documentos têm dados pessoais de sócios e procuradores: só a SECONSER vê. */}
      {empresa && podeEditar && <Documentos empresa={empresa} />}
      {!empresa && (
        <p className="text-sm text-slate-500">
          Depois de salvar os dados, você poderá registrar a inscrição, os responsáveis técnicos,
          o pessoal, os veículos e os documentos do art. 6º.
        </p>
      )}
    </div>
  );
}

function EmpresaForm({
  inicial, editando, somenteLeitura, operadoras, onSubmit,
}: {
  inicial: EmpresaInput;
  editando: boolean;
  somenteLeitura: boolean;
  operadoras: Empresa[];
  onSubmit: (input: EmpresaInput, contratantes: string[]) => Promise<void>;
}) {
  const [v, setV] = useState<EmpresaInput>(inicial);
  const [contratantes, setContratantes] = useState<string[]>([]);
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
      className="contents"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null); setSalvo(false);
        if (!editando && !isValidCnpj(v.cnpj)) { setError('CNPJ inválido.'); return; }
        if (!editando && v.tipo === 'terceirizada' && contratantes.length === 0) {
          setError('Marque ao menos uma operadora atendida pela terceirizada.'); return;
        }
        setBusy(true);
        try { await onSubmit(v, contratantes); setSalvo(true); }
        catch (err) { setError(err); }
        finally { setBusy(false); }
      }}
    >
      <fieldset disabled={somenteLeitura} className="grid gap-4 sm:grid-cols-6">
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
      <Field label="Tipo" required className="sm:col-span-3"
             hint={editando ? 'O tipo faz parte do código CADEX e não pode ser alterado.' : undefined}>
        <select id="tipo" className={inputClass} value={v.tipo} disabled={editando}
                onChange={(e) => set('tipo', e.target.value as EmpresaInput['tipo'])}>
          <option value="operadora">Operadora de telecomunicações (concessionária contratante)</option>
          <option value="terceirizada">Terceirizada (empresa executora)</option>
        </select>
      </Field>
      {!editando && v.tipo === 'terceirizada' && (
        <fieldset className="sm:col-span-6">
          <legend className="text-sm font-medium text-slate-700">
            Operadoras atendidas<span className="ml-0.5 text-red-600" aria-hidden>*</span>
          </legend>
          {operadoras.length === 0
            ? <p className="mt-1 text-xs text-slate-500">Cadastre a operadora antes da terceirizada.</p>
            : (
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {operadoras.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={contratantes.includes(o.id)}
                           onChange={(e) => setContratantes((c) =>
                             e.target.checked ? [...c, o.id] : c.filter((x) => x !== o.id))} />
                    {nomeEmpresa(o)}
                  </label>
                ))}
              </div>
            )}
        </fieldset>
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

      <Field label="Observações" className="sm:col-span-6">
        <textarea id="observacoes" rows={2} className={inputClass} {...text('observacoes')} />
      </Field>

      {!somenteLeitura && (
        <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar empresa'}
          </Button>
          {salvo && editando && <span className="text-sm text-emerald-700">Alterações salvas.</span>}
        </div>
      )}
      <div className="sm:col-span-6"><ErrorNote error={error} /></div>
      </fieldset>
    </form>
  );
}

function Vinculos({
  empresa, todas, podeEditar,
}: { empresa: Empresa; todas: Empresa[]; podeEditar: boolean }) {
  const [vinculos, setVinculos] = useState<Vinculo[] | null>(null);
  const [nova, setNova] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const ehTerceirizada = empresa.tipo === 'terceirizada';
  const porId = new Map(todas.map((e) => [e.id, e]));

  const recarregar = () =>
    listarVinculos()
      .then((v) => setVinculos(v.filter((x) =>
        ehTerceirizada ? x.terceirizada_id === empresa.id : x.operadora_id === empresa.id)))
      .catch(setError);

  useEffect(() => { void recarregar(); }, [empresa.id]);

  const agir = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); await recarregar(); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  };

  const outra = (v: Vinculo) => porId.get(ehTerceirizada ? v.operadora_id : v.terceirizada_id);
  const disponiveis = todas.filter((o) =>
    o.tipo === 'operadora' && !(vinculos ?? []).some((v) => v.operadora_id === o.id));

  return (
    <Card title={ehTerceirizada ? 'Operadoras atendidas' : 'Terceirizadas que atendem esta operadora'}>
      <ErrorNote error={error} />
      {!vinculos ? <Spinner /> : vinculos.length === 0 ? (
        <p className="text-sm text-slate-500">
          {ehTerceirizada ? 'Nenhuma operadora vinculada.' : 'Nenhuma terceirizada vinculada.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {vinculos.map((v) => {
            const e = outra(v);
            return (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  {e ? (
                    <Link to={`/empresas/${e.id}`} className="font-medium text-gov-700 hover:underline">
                      {nomeEmpresa(e)}
                    </Link>
                  ) : '—'}
                  {e && <span className="ml-2 font-mono text-xs text-slate-500">{e.codigo_cadex}</span>}
                  <div className="text-xs text-slate-500">
                    desde {dataBR(v.inicio)}{v.fim && ` · encerrado em ${dataBR(v.fim)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tom={v.fim ? 'neutro' : 'bom'}>{v.fim ? 'Encerrado' : 'Ativo'}</Badge>
                  {podeEditar && (
                    <Button variant="secondary" className="!px-2 !py-1 text-xs" disabled={busy}
                            onClick={() => agir(() => definirFimVinculo(v.id, v.fim ? null : hojeISO()))}>
                      {v.fim ? 'Reativar' : 'Encerrar'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {podeEditar && ehTerceirizada && disponiveis.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select aria-label="Operadora a vincular" className={`${inputClass} !w-auto`} value={nova}
                  onChange={(e) => setNova(e.target.value)}>
            <option value="">Vincular a outra operadora…</option>
            {disponiveis.map((o) => <option key={o.id} value={o.id}>{nomeEmpresa(o)}</option>)}
          </select>
          <Button variant="secondary" disabled={busy || !nova}
                  onClick={() => agir(async () => { await criarVinculo(nova, empresa.id); setNova(''); })}>
            Vincular
          </Button>
        </div>
      )}
    </Card>
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
