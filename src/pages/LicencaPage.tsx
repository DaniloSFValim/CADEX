import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorNote, Field, Spinner, Titulo, botaoLink, inputClass, linkTexto } from '../components/ui';
import { QrCode } from '../components/QrCode';
import { SituacaoBadge, dataBR } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj, isValidCnpj, onlyDigits } from '../lib/cnpj';
import {
  hojeISO, listarDaEmpresa, listarEmpresas, listarVinculos, nomeEmpresa, podeAtuar, situacaoEfetiva,
  type Empresa, type Registro, type Vinculo,
} from '../lib/empresas';
import {
  ESTADO_LICENCA_LABEL, SITUACAO_LICENCA_LABEL, TIPO_OBRA_LABEL, TOM_ESTADO_LICENCA, buscarLicenca,
  anteriorResolucao, coordenadaTexto, estadoLicenca, lerCoordenada, linkMapa, salvarLicenca,
  urlPublicaLicenca,
  type LicencaComTrechos, type LicencaInput, type SituacaoLicenca, type TipoObra, type Trecho,
} from '../lib/licencas';

interface TrechoForm { id?: string; logradouro: string; bairro: string; referencia: string; inicio: string; fim: string }

type Form = {
  processo_sei: string; numero: string; tipos_obra: TipoObra[]; escopo: string; observacoes: string;
  executora_id: string; contratante_id: string; subcontratada_id: string; responsavel_tecnico_id: string;
  executora_razao_social: string; executora_cnpj: string; contratante_razao_social: string; contratante_cnpj: string;
  art_numero: string; protocolo_data: string; situacao: SituacaoLicenca; decisao_data: string;
  inicio_previsto: string; fim_previsto: string; concluida_em: string; as_built_sei: string; as_built_data: string;
};

/** Opção do seletor para empresa sem cadastro (só em licença anterior à Resolução). */
const SEM_CADASTRO = '__sem_cadastro__';

const TRECHO_VAZIO: TrechoForm = { logradouro: '', bairro: '', referencia: '', inicio: '', fim: '' };

const VAZIO: Form = {
  processo_sei: '', numero: '', tipos_obra: [], escopo: '', observacoes: '',
  executora_id: '', contratante_id: '', subcontratada_id: '', responsavel_tecnico_id: '',
  executora_razao_social: '', executora_cnpj: '', contratante_razao_social: '', contratante_cnpj: '',
  art_numero: '', protocolo_data: '', situacao: 'em_analise', decisao_data: '',
  inicio_previsto: '', fim_previsto: '', concluida_em: '', as_built_sei: '', as_built_data: '',
};

function paraForm(l: LicencaComTrechos): Form {
  const s = (v: string | null) => v ?? '';
  return {
    processo_sei: l.processo_sei, numero: s(l.numero), tipos_obra: l.tipos_obra, escopo: l.escopo,
    observacoes: s(l.observacoes),
    executora_id: l.executora_id ?? (l.executora_razao_social ? SEM_CADASTRO : ''),
    contratante_id: l.contratante_id ?? (l.contratante_razao_social ? SEM_CADASTRO : ''),
    executora_razao_social: s(l.executora_razao_social), executora_cnpj: l.executora_cnpj ? formatCnpj(l.executora_cnpj) : '',
    contratante_razao_social: s(l.contratante_razao_social), contratante_cnpj: l.contratante_cnpj ? formatCnpj(l.contratante_cnpj) : '',
    subcontratada_id: s(l.subcontratada_id), responsavel_tecnico_id: s(l.responsavel_tecnico_id),
    art_numero: s(l.art_numero), protocolo_data: l.protocolo_data, situacao: l.situacao,
    decisao_data: s(l.decisao_data), inicio_previsto: s(l.inicio_previsto), fim_previsto: s(l.fim_previsto),
    concluida_em: s(l.concluida_em), as_built_sei: s(l.as_built_sei), as_built_data: s(l.as_built_data),
  };
}

const trechoParaForm = (t: Trecho & { id: string }): TrechoForm => ({
  id: t.id, logradouro: t.logradouro, bairro: t.bairro ?? '', referencia: t.referencia ?? '',
  inicio: coordenadaTexto(t.inicio_lat, t.inicio_lng),
  fim: t.fim_lat != null && t.fim_lng != null ? coordenadaTexto(t.fim_lat, t.fim_lng) : '',
});

export default function LicencaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { podeEditar } = useAuth();
  const [licenca, setLicenca] = useState<LicencaComTrechos | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setLicenca(null);
    Promise.all([id ? buscarLicenca(id) : Promise.resolve(null), listarEmpresas(), listarVinculos()])
      .then(([l, e, v]) => { setLicenca(l); setEmpresas(e); setVinculos(v); })
      .catch(setError);
  }, [id]);

  if (error && !empresas) return <ErrorNote error={error} />;
  if (!empresas || (id && !licenca)) return <Spinner />;

  const hoje = hojeISO();
  const estado = licenca ? estadoLicenca(licenca, hoje) : null;

  return (
    <>
      <Titulo
        trilha={<><Link to="/obras" className="hover:underline">Obras</Link> / {licenca ? licenca.processo_sei : 'nova'}</>}
        titulo={licenca ? (licenca.numero ? `Licença ${licenca.numero}` : 'Pedido de licença') : 'Registrar licença'}
        descricao={licenca
          ? <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tom={TOM_ESTADO_LICENCA[estado!]}>{ESTADO_LICENCA_LABEL[estado!]}</Badge>
              {licenca.anterior_resolucao && <Badge>Anterior à Resolução</Badge>}
              <span>Processo {licenca.processo_sei}, protocolado em {dataBR(licenca.protocolo_data)}.</span>
            </span>
          : 'Lance os dados do processo. Licença nova exige executora e subcontratada APTAS no CADEX; licença com decisão anterior a 09/09/2026 é registro histórico.'}
      />
      {licenca?.situacao === 'deferida' && <Placa licenca={licenca} />}
      <LicencaForm
        key={licenca?.id ?? 'nova'}
        licenca={licenca}
        empresas={empresas}
        vinculos={vinculos}
        somenteLeitura={!podeEditar}
        onSalvo={async (novoId) => {
          if (!licenca) navigate(`/obras/${novoId}`, { replace: true });
          else setLicenca(await buscarLicenca(novoId));
        }}
      />
    </>
  );
}

function LicencaForm({ licenca, empresas, vinculos, somenteLeitura, onSalvo }: {
  licenca: LicencaComTrechos | null; empresas: Empresa[]; vinculos: Vinculo[]; somenteLeitura: boolean;
  onSalvo: (id: string) => Promise<void>;
}) {
  const [f, setF] = useState<Form>(licenca ? paraForm(licenca) : VAZIO);
  const [trechos, setTrechos] = useState<TrechoForm[]>(
    licenca?.licenca_trechos.length ? licenca.licenca_trechos.map(trechoParaForm) : [TRECHO_VAZIO]);
  const [rts, setRts] = useState<Registro[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [salvo, setSalvo] = useState(false);
  const hoje = hojeISO();

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((x) => ({ ...x, [k]: v })); setSalvo(false); };
  const porId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const executora = porId.get(f.executora_id);
  const operadoras = empresas.filter((e) => e.tipo === 'operadora' && e.id !== f.executora_id);

  // Responsáveis técnicos da executora e da subcontratada.
  useEffect(() => {
    const ids = [f.executora_id, f.subcontratada_id].filter((i) => i && i !== SEM_CADASTRO);
    Promise.all(ids.map((i) => listarDaEmpresa('responsaveis_tecnicos', i)))
      .then((r) => setRts(r.flat()))
      .catch(setError);
  }, [f.executora_id, f.subcontratada_id]);

  const deferindo = f.situacao === 'deferida';
  const anterior = anteriorResolucao(f.decisao_data || null);
  const executoraSemCadastro = f.executora_id === SEM_CADASTRO;
  const contratanteSemCadastro = f.contratante_id === SEM_CADASTRO;
  // Licença nova: só subcontratada com vínculo ativo. Anterior à Resolução: qualquer terceirizada cadastrada.
  const subcontratadas = anterior
    ? empresas.filter((e) => e.tipo === 'terceirizada' && e.id !== f.executora_id)
    : vinculos
      .filter((v) => v.contratante_id === f.executora_id && !v.fim)
      .map((v) => porId.get(v.contratada_id))
      .filter((e): e is Empresa => Boolean(e));
  const naoAptas = anterior ? [] : [f.executora_id, f.subcontratada_id]
    .map((i) => porId.get(i))
    .filter((e): e is Empresa => Boolean(e) && !podeAtuar(situacaoEfetiva(e!, hoje)));

  const setTrecho = (i: number, k: keyof TrechoForm, v: string) => {
    setTrechos((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
    setSalvo(false);
  };

  function montar(): { licenca: LicencaInput; trechos: Trecho[] } | string {
    if (!f.processo_sei.trim()) return 'Informe o número do processo.';
    if ((executoraSemCadastro || contratanteSemCadastro) && !anterior) {
      return 'Empresa sem cadastro no CADEX só em licença com decisão anterior a 09/09/2026. Cadastre a empresa ou corrija a data da decisão.';
    }
    if (executoraSemCadastro && !f.executora_razao_social.trim()) return 'Informe a razão social da executora.';
    if (contratanteSemCadastro && !f.contratante_razao_social.trim()) return 'Informe a razão social da contratante.';
    for (const [quem, c] of [['executora', f.executora_cnpj], ['contratante', f.contratante_cnpj]] as const) {
      if (c.trim() && !isValidCnpj(c)) return `CNPJ da ${quem} inválido.`;
    }
    if (f.tipos_obra.length === 0) return 'Marque ao menos um tipo de obra (art. 10).';
    const lista: Trecho[] = [];
    for (const [i, t] of trechos.entries()) {
      const n = trechos.length > 1 ? ` ${i + 1}` : '';
      if (!t.logradouro.trim()) return `Trecho${n}: informe o logradouro.`;
      const ini = lerCoordenada(t.inicio);
      if (!ini) return `Trecho${n}: coordenada de início não reconhecida ou fora de Niterói.`;
      const fim = t.fim.trim() ? lerCoordenada(t.fim) : null;
      if (t.fim.trim() && !fim) return `Trecho${n}: coordenada de fim não reconhecida ou fora de Niterói.`;
      lista.push({
        ...(t.id ? { id: t.id } : {}), logradouro: t.logradouro.trim(), bairro: t.bairro.trim() || null,
        referencia: t.referencia.trim() || null, inicio_lat: ini.lat, inicio_lng: ini.lng,
        fim_lat: fim?.lat ?? null, fim_lng: fim?.lng ?? null,
      });
    }
    const n = (v: string) => v.trim() || null;
    return {
      licenca: {
        ...(licenca ? { id: licenca.id } : {}),
        processo_sei: f.processo_sei, numero: n(f.numero), tipos_obra: f.tipos_obra, escopo: f.escopo.trim(),
        observacoes: n(f.observacoes),
        executora_id: executoraSemCadastro ? null : f.executora_id,
        executora_razao_social: executoraSemCadastro ? n(f.executora_razao_social) : null,
        executora_cnpj: executoraSemCadastro && f.executora_cnpj.trim() ? onlyDigits(f.executora_cnpj) : null,
        contratante_id: contratanteSemCadastro ? null : n(f.contratante_id),
        contratante_razao_social: contratanteSemCadastro ? n(f.contratante_razao_social) : null,
        contratante_cnpj: contratanteSemCadastro && f.contratante_cnpj.trim() ? onlyDigits(f.contratante_cnpj) : null,
        subcontratada_id: n(f.subcontratada_id), responsavel_tecnico_id: n(f.responsavel_tecnico_id),
        art_numero: n(f.art_numero), protocolo_data: f.protocolo_data, situacao: f.situacao,
        decisao_data: n(f.decisao_data), inicio_previsto: n(f.inicio_previsto), fim_previsto: n(f.fim_previsto),
        concluida_em: deferindo ? n(f.concluida_em) : null,
        as_built_sei: deferindo && f.concluida_em ? n(f.as_built_sei) : null,
        as_built_data: deferindo && f.concluida_em ? n(f.as_built_data) : null,
      },
      trechos: lista,
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const m = montar();
    if (typeof m === 'string') { setError(m); return; }
    setBusy(true);
    try {
      const novoId = await salvarLicenca(m.licenca, m.trechos);
      await onSalvo(novoId);
      setSalvo(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const ro = somenteLeitura;

  return (
    <form onSubmit={submit} className="space-y-10">
      <Card title="Pedido">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nº do processo" required hint="SEI (NIT-050120/000000/2026) ou a numeração anterior.">
            <input className={`${inputClass} tabular`} required disabled={ro} value={f.processo_sei}
                   onChange={(e) => set('processo_sei', e.target.value)} />
          </Field>
          <Field label="Data do protocolo" required>
            <input type="date" className={inputClass} required disabled={ro} value={f.protocolo_data}
                   onChange={(e) => set('protocolo_data', e.target.value)} />
          </Field>
        </div>
        <fieldset className="mt-5">
          <legend className="text-[13px] font-medium text-tinta-700">
            Tipo de obra <span className="text-baixa" aria-hidden>*</span>
            <span className="ml-2 font-normal text-tinta-500">art. 10; marque todos que se aplicam</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {(Object.keys(TIPO_OBRA_LABEL) as TipoObra[]).map((t) => (
              <label key={t} className="inline-flex items-center gap-2 text-sm text-tinta-800">
                <input type="checkbox" disabled={ro} checked={f.tipos_obra.includes(t)}
                       onChange={(e) => set('tipos_obra', e.target.checked
                         ? (Object.keys(TIPO_OBRA_LABEL) as TipoObra[]).filter((x) => x === t || f.tipos_obra.includes(x))
                         : f.tipos_obra.filter((x) => x !== t))} />
                {TIPO_OBRA_LABEL[t]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Escopo da obra" required className="mt-5" hint="O que será feito, como aparecerá na placa do canteiro (art. 14).">
          <textarea className={inputClass} rows={2} required disabled={ro} value={f.escopo}
                    onChange={(e) => set('escopo', e.target.value)} />
        </Field>
      </Card>

      <Card title="Decisão">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Situação" required>
            <select className={inputClass} disabled={ro}
                    value={f.situacao} onChange={(e) => set('situacao', e.target.value as SituacaoLicenca)}>
              {(Object.keys(SITUACAO_LICENCA_LABEL) as SituacaoLicenca[])
                .filter((s) => licenca?.situacao !== 'deferida' || s === 'deferida' || s === 'cancelada')
                .map((s) => <option key={s} value={s}>{SITUACAO_LICENCA_LABEL[s]}</option>)}
            </select>
          </Field>
          {f.situacao !== 'em_analise' && (
            <Field label="Data da decisão" required={f.situacao !== 'cancelada'}>
              <input type="date" className={inputClass} disabled={ro} value={f.decisao_data}
                     required={f.situacao !== 'cancelada'} onChange={(e) => set('decisao_data', e.target.value)} />
            </Field>
          )}
          {deferindo && (
            <Field label="Nº da licença" required hint="Numeração própria da SECONSER.">
              <input className={inputClass} required disabled={ro} value={f.numero} onChange={(e) => set('numero', e.target.value)} />
            </Field>
          )}
        </div>
        {deferindo && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Início do cronograma" required>
              <input type="date" className={inputClass} required disabled={ro} value={f.inicio_previsto}
                     onChange={(e) => set('inicio_previsto', e.target.value)} />
            </Field>
            <Field label="Fim do cronograma" required hint="É a validade da licença (art. 13, parágrafo único).">
              <input type="date" className={inputClass} required disabled={ro} value={f.fim_previsto}
                     min={f.inicio_previsto || undefined} onChange={(e) => set('fim_previsto', e.target.value)} />
            </Field>
          </div>
        )}
        {deferindo && naoAptas.length > 0 && licenca?.situacao !== 'deferida' && (
          <p role="alert" className="mt-4 rounded border-l-4 border-baixa bg-baixa/10 px-3 py-2 text-sm text-baixa">
            {naoAptas.map(nomeEmpresa).join(' e ')} não {naoAptas.length > 1 ? 'estão' : 'está'} APTA no CADEX.
            A licença não pode ser deferida enquanto a inscrição não for deferida (arts. 4º e 8º, § 2º).
          </p>
        )}
        {anterior && (
          <p className="mt-4 rounded border-l-4 border-tinta-300 bg-tinta-50 px-3 py-2 text-sm text-tinta-700">
            Decisão anterior a 09/09/2026: registro histórico, anterior à Resolução. Não exige empresa APTA nem ART,
            e aceita executora e contratante sem cadastro no CADEX.
          </p>
        )}
        {licenca?.situacao === 'deferida' && (
          <p className="mt-4 text-sm text-tinta-500">Licença deferida só pode ser cancelada.</p>
        )}
      </Card>

      <Card title="Empresas">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Empresa executora" required>
            <select className={inputClass} required disabled={ro} value={f.executora_id}
                    onChange={(e) => { set('executora_id', e.target.value); set('subcontratada_id', ''); set('responsavel_tecnico_id', ''); }}>
              <option value="">Selecione</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)} ({e.codigo_cadex})</option>)}
              {(anterior || executoraSemCadastro) && <option value={SEM_CADASTRO}>Empresa sem cadastro no CADEX</option>}
            </select>
          </Field>
          <Field label="Concessionária contratante"
                 hint={executora?.tipo === 'terceirizada' && !anterior ? 'Obrigatória para executora terceirizada.' : 'Deixe em branco se a operadora executa a própria obra.'}>
            <select className={inputClass} disabled={ro} required={executora?.tipo === 'terceirizada' && !anterior}
                    value={f.contratante_id} onChange={(e) => set('contratante_id', e.target.value)}>
              <option value="">Nenhuma</option>
              {operadoras.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
              {(anterior || contratanteSemCadastro) && <option value={SEM_CADASTRO}>Empresa sem cadastro no CADEX</option>}
            </select>
          </Field>
          {executoraSemCadastro && (
            <SemCadastro quem="executora" ro={ro} razao={f.executora_razao_social} cnpj={f.executora_cnpj}
                         onRazao={(v) => set('executora_razao_social', v)} onCnpj={(v) => set('executora_cnpj', v)} />
          )}
          {contratanteSemCadastro && (
            <SemCadastro quem="contratante" ro={ro} razao={f.contratante_razao_social} cnpj={f.contratante_cnpj}
                         onRazao={(v) => set('contratante_razao_social', v)} onCnpj={(v) => set('contratante_cnpj', v)} />
          )}
          <Field label="Subcontratada" hint={anterior ? undefined : f.executora_id && subcontratadas.length === 0
            ? 'A executora não tem subcontratadas com vínculo ativo.' : 'Só aparecem as que têm vínculo ativo com a executora.'}>
            <select className={inputClass} disabled={ro || subcontratadas.length === 0} value={f.subcontratada_id}
                    onChange={(e) => { set('subcontratada_id', e.target.value); set('responsavel_tecnico_id', ''); }}>
              <option value="">Nenhuma</option>
              {subcontratadas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
            </select>
          </Field>
          <Field label="Responsável técnico" hint={f.executora_id && rts.length === 0
            ? 'Nenhum responsável técnico cadastrado na executora ou na subcontratada.' : undefined}>
            <select className={inputClass} disabled={ro || rts.length === 0} value={f.responsavel_tecnico_id}
                    onChange={(e) => set('responsavel_tecnico_id', e.target.value)}>
              <option value="">Não informado</option>
              {rts.map((r) => <option key={r.id} value={r.id}>{String(r.nome)} ({String(r.conselho)} {String(r.registro_numero)})</option>)}
            </select>
          </Field>
          <Field label="ART/RRT da obra" hint={anterior ? 'Específica desta intervenção. Opcional em licença anterior à Resolução.' : 'Específica desta intervenção (art. 12). Obrigatória para deferir.'}>
            <input className={inputClass} disabled={ro} value={f.art_numero} onChange={(e) => set('art_numero', e.target.value)} />
          </Field>
        </div>
        {[f.executora_id, f.contratante_id, f.subcontratada_id].some((i) => i && i !== SEM_CADASTRO) && (
          <ul className="mt-4 space-y-1 text-sm">
            {([['Executora', f.executora_id], ['Contratante', f.contratante_id], ['Subcontratada', f.subcontratada_id]] as const)
              .filter(([, i]) => i && i !== SEM_CADASTRO)
              .map(([r, i]) => {
                const e = porId.get(i)!;
                return (
                  <li key={r} className="flex flex-wrap items-center gap-2 text-tinta-700">
                    <span className="w-28 text-tinta-500">{r}</span>
                    <SituacaoBadge s={situacaoEfetiva(e, hoje)} />
                    <Link to={`/empresas/${e.id}`} className="hover:underline">{nomeEmpresa(e)}</Link>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      <Card title={`Trechos (${trechos.length})`}
            action={!ro && <Button variant="secondary" className="!px-3 !py-1.5"
                                   onClick={() => { setTrechos((t) => [...t, TRECHO_VAZIO]); setSalvo(false); }}>
              Incluir trecho</Button>}>
        <p className="mb-4 text-sm text-tinta-500">
          Cole as coordenadas do Google Maps (clique com o botão direito no ponto e copie) ou o link do local.
          Sem fim, o trecho é pontual, como a implantação de um poste.
        </p>
        <ol className="divide-y divide-tinta-100">
          {trechos.map((t, i) => {
            const ini = lerCoordenada(t.inicio);
            const fim = t.fim.trim() ? lerCoordenada(t.fim) : null;
            return (
              <li key={t.id ?? `novo-${i}`} className="grid gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-6">
                <Field label={trechos.length > 1 ? `Logradouro do trecho ${i + 1}` : 'Logradouro'} required className="sm:col-span-3">
                  <input className={inputClass} disabled={ro} value={t.logradouro}
                         onChange={(e) => setTrecho(i, 'logradouro', e.target.value)} />
                </Field>
                <Field label="Bairro" className="sm:col-span-2">
                  <input className={inputClass} disabled={ro} value={t.bairro} onChange={(e) => setTrecho(i, 'bairro', e.target.value)} />
                </Field>
                <div className="flex items-end sm:col-span-1">
                  {!ro && trechos.length > 1 && (
                    <Button variant="danger" className="w-full !px-3"
                            onClick={() => { setTrechos((ts) => ts.filter((_, j) => j !== i)); setSalvo(false); }}>
                      Remover
                    </Button>
                  )}
                </div>
                <CoordField label="Início" required valor={t.inicio} lida={ini} ro={ro}
                            onChange={(v) => setTrecho(i, 'inicio', v)} />
                <CoordField label="Fim" valor={t.fim} lida={fim} ro={ro} onChange={(v) => setTrecho(i, 'fim', v)} />
                <Field label="Referência" className="sm:col-span-2" hint="Ex.: em frente ao nº 120.">
                  <input className={inputClass} disabled={ro} value={t.referencia}
                         onChange={(e) => setTrecho(i, 'referencia', e.target.value)} />
                </Field>
                {ini && (
                  <a className={`${linkTexto} text-sm sm:col-span-6`} target="_blank" rel="noopener noreferrer"
                     href={linkMapa({ inicio_lat: ini.lat, inicio_lng: ini.lng, fim_lat: fim?.lat ?? null, fim_lng: fim?.lng ?? null })}>
                    Conferir no mapa (abre em outra aba)
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {deferindo && licenca?.situacao === 'deferida' && (
        <Card title="Conclusão da obra">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Concluída em">
              <input type="date" className={inputClass} disabled={ro} value={f.concluida_em}
                     min={f.inicio_previsto || undefined} onChange={(e) => set('concluida_em', e.target.value)} />
            </Field>
            {f.concluida_em && (<>
              <Field label="As Built: nº do documento SEI" hint="Art. 26: projeto como construído, georreferenciado.">
                <input className={inputClass} disabled={ro} value={f.as_built_sei}
                       required={Boolean(f.as_built_data)} onChange={(e) => set('as_built_sei', e.target.value)} />
              </Field>
              <Field label="As Built: data do protocolo">
                <input type="date" className={inputClass} disabled={ro} value={f.as_built_data}
                       required={Boolean(f.as_built_sei)} onChange={(e) => set('as_built_data', e.target.value)} />
              </Field>
            </>)}
          </div>
        </Card>
      )}

      <Card title="Observações">
        <textarea className={inputClass} rows={2} disabled={ro} value={f.observacoes}
                  onChange={(e) => set('observacoes', e.target.value)} aria-label="Observações" />
      </Card>

      {!ro && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-tinta-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mr-auto min-w-0"><ErrorNote error={error} /></div>
          {salvo && <span className="text-sm text-alta" role="status">Licença salva.</span>}
          <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : licenca ? 'Salvar alterações' : 'Registrar licença'}</Button>
        </div>
      )}
      {ro && <ErrorNote error={error} />}
    </form>
  );
}

function CoordField({ label, valor, lida, ro, required, onChange }: {
  label: string; valor: string; lida: { lat: number; lng: number } | null; ro: boolean; required?: boolean;
  onChange: (v: string) => void;
}) {
  const hint = !valor.trim() ? (required ? 'Latitude, longitude.' : 'Opcional.')
    : lida ? `Lida: ${coordenadaTexto(lida.lat, lida.lng)}` : 'Não reconhecida ou fora de Niterói.';
  return (
    <Field label={label} required={required} className="sm:col-span-2" hint={hint}>
      <input className={`${inputClass} tabular ${valor.trim() && !lida ? '!border-baixa' : ''}`} disabled={ro}
             value={valor} placeholder="-22.895000, -43.123000" onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/** QR Code da placa do canteiro (art. 14) e atalho para imprimir. */
function Placa({ licenca }: { licenca: LicencaComTrechos }) {
  const url = urlPublicaLicenca(licenca.codigo_publico);
  const [copiado, setCopiado] = useState(false);
  return (
    <section className="cartao mb-10 flex flex-wrap items-center gap-6 p-5">
      <QrCode texto={url} tamanho={120} />
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-bold tracking-[-0.015em] text-tinta-900">Placa do canteiro</h2>
        <p className="mt-1 max-w-xl text-sm text-tinta-600">
          O QR Code abre a página pública desta licença, onde o fiscal confere se a obra está autorizada hoje (art. 14).
        </p>
        <p className="mt-2 break-all text-xs text-tinta-500">{url}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={`/obras/${licenca.id}/placa`} className={botaoLink.primary}>Imprimir placa</Link>
          <a href={url} target="_blank" rel="noopener noreferrer" className={botaoLink.secondary}>Abrir página pública</a>
          <Button variant="secondary" onClick={() => {
            navigator.clipboard?.writeText(url).then(() => setCopiado(true)).catch(() => setCopiado(false));
          }}>{copiado ? 'Link copiado' : 'Copiar link'}</Button>
        </div>
      </div>
    </section>
  );
}

/** Executora ou contratante que não está no CADEX (licença anterior à Resolução). */
function SemCadastro({ quem, ro, razao, cnpj, onRazao, onCnpj }: {
  quem: 'executora' | 'contratante'; ro: boolean; razao: string; cnpj: string;
  onRazao: (v: string) => void; onCnpj: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 rounded border border-dashed border-tinta-300 p-4 sm:col-span-2 sm:grid-cols-[1fr_220px]">
      <Field label={`Razão social da ${quem}`} required hint="Não entra no cadastro nem na consulta pública de empresas.">
        <input className={inputClass} required disabled={ro} value={razao} onChange={(e) => onRazao(e.target.value)} />
      </Field>
      <Field label="CNPJ" hint="Se constar no processo.">
        <input className={`${inputClass} tabular`} disabled={ro} value={cnpj} inputMode="numeric"
               onChange={(e) => onCnpj(formatCnpj(e.target.value))} />
      </Field>
    </div>
  );
}
