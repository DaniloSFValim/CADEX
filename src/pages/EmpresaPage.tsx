import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorNote, Field, Spinner, Titulo, inputClass, type Tom } from '../components/ui';
import { SituacaoBadge } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj, isValidCnpj, onlyDigits } from '../lib/cnpj';
import {
  ESTADO_LABEL, SETORES, SETOR_LABEL, TIPO_LABEL, buscarEmpresa, descricaoEmpresa, ehContratante, tiposDaEmpresa, criarEmpresa, criarVinculo, criarVinculoOrgao, definirFimVinculo,
  enviarLogo, estadoDocumento, registrarDocumentos, removerLogo, urlLogo, MAX_LOGO_BYTES, TIPOS_LOGO, hojeISO, listarDocumentos, listarEmpresas,
  listarTiposDocumento, listarVinculos, nomeEmpresa, resumoDocumentos,
  salvarEmpresa, situacaoEfetiva, ultimoPorTipo, SITUACAO_LABEL,
  type Documento, type Empresa, type EmpresaInput, type EstadoDocumento, type Setor, type SituacaoEfetiva, type TipoDocumento,
  type Vinculo,
} from '../lib/empresas';
import { listarLicencas, type LicencaComTrechos } from '../lib/licencas';
import { listarOrgaos, nomeOrgao, type Orgao } from '../lib/orgaos';
import { ResumoBadge } from './Empresas';
import { Inscricao } from './Inscricao';
import { LicencasDaEmpresa, PanoramaEmpresa } from './Licencas';
import { Operacional } from './Operacional';

const VAZIA: EmpresaInput = {
  cnpj: '', razao_social: '', nome_fantasia: '', tipo: 'operadora', setores: ['telecom'],
  email: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: 'Niterói', uf: 'RJ', representante: '', observacoes: '',
};

const paraInput = (e: Empresa): EmpresaInput => ({
  cnpj: formatCnpj(e.cnpj), razao_social: e.razao_social, nome_fantasia: e.nome_fantasia ?? '',
  tipo: e.tipo, setores: e.setores, email: e.email, telefone: e.telefone ?? '',
  cep: e.cep ?? '', logradouro: e.logradouro ?? '', numero: e.numero ?? '',
  complemento: e.complemento ?? '', bairro: e.bairro ?? '', cidade: e.cidade ?? '',
  uf: e.uf ?? '', representante: e.representante ?? '', observacoes: e.observacoes ?? '',
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

  const [licencas, setLicencas] = useState<LicencaComTrechos[] | null>(null);
  const [licErro, setLicErro] = useState<unknown>(null);
  useEffect(() => {
    if (!id) { setLicencas(null); setLicErro(null); return; }
    setLicencas(null); setLicErro(null);
    listarLicencas(id).then(setLicencas).catch(setLicErro);
  }, [id]);

  if (loading) return <Spinner />;
  if (id && !empresa) return <ErrorNote error={error ?? 'Empresa não encontrada.'} />;
  if (!id && !podeEditar) return <ErrorNote error="Seu perfil é só de consulta." />;

  const recarregar = async () => { if (empresa) setEmpresa(await buscarEmpresa(empresa.id)); };
  // Quem pode aparecer na traseira dos veículos (art. 21): quem contrata.
  const contratantesTodas = todas.filter((o) => ehContratante(o.tipo));

  return (
    <div className="space-y-6">
      {empresa ? (
        <DossieEmpresa empresa={empresa} />
      ) : (
        <Titulo
          trilha={<><Link to="/empresas" className="hover:text-marca-700 hover:underline">Empresas</Link> / Nova</>}
          titulo="Nova empresa"
        />
      )}

      {empresa && licencas && <PanoramaEmpresa empresa={empresa} licencas={licencas} />}

      <Card title="Dados da empresa">
        <EmpresaForm
          key={empresa?.id ?? 'nova'}
          inicial={empresa ? paraInput(empresa) : VAZIA}
          editando={Boolean(empresa)}
          somenteLeitura={!podeEditar}
          empresas={todas}
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
        {empresa && (
          <div className="mt-6 border-t border-tinta-100 pt-5">
            <LogoEmpresa empresa={empresa} podeEditar={podeEditar}
                         onChanged={async () => setEmpresa(await buscarEmpresa(empresa.id))} />
          </div>
        )}
      </Card>

      {empresa && <Inscricao empresa={empresa} podeEditar={podeEditar} onSalvo={recarregar} />}

      {empresa && <Vinculos empresa={empresa} todas={todas} podeEditar={podeEditar} />}

      {empresa && <Operacional empresa={empresa} operadoras={contratantesTodas} podeEditar={podeEditar} />}

      {empresa && <LicencasDaEmpresa licencas={licencas} error={licErro} todas={todas} />}

      {/* Documentos têm dados pessoais de sócios e procuradores: só a SECONSER vê. */}
      {empresa && podeEditar && <Documentos empresa={empresa} />}
      {!empresa && (
        <p className="text-sm text-tinta-500">
          Salve os dados para registrar inscrição, vínculos, pessoal, veículos e documentos.
        </p>
      )}
    </div>
  );
}

/** Cor do ponto do selo de situação, legível sobre a faixa escura. */
function corSelo(s: SituacaoEfetiva): string {
  if (s === 'apta' || s === 'deferida') return '#51d49a';
  if (s === 'em_saneamento') return '#f0b24a';
  if (s === 'em_analise') return '#bcdadd';
  return '#f08a7a'; // inapta, vencida
}

/** Iniciais para o selo quando a empresa não tem logo. */
function iniciais(e: Empresa): string {
  const base = (e.nome_fantasia?.trim() || e.razao_social).replace(/\b(S\.?A\.?|LTDA\.?|ME|EIRELI)\b/gi, '').trim();
  const ps = base.split(/\s+/).filter(Boolean);
  const ini = ((ps[0]?.[0] ?? '') + (ps[1]?.[0] ?? '')).toUpperCase();
  return ini || base.slice(0, 2).toUpperCase();
}

function Idc({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="border-t border-white/10 px-6 py-3.5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <dt className="text-xs text-marca-100/70">{rotulo}</dt>
      <dd className={`mt-0.5 font-semibold text-white ${mono ? 'font-mono' : ''}`}>{valor}</dd>
    </div>
  );
}

/** Cabeçalho-dossiê da empresa: identidade e documentos numa faixa institucional. */
function DossieEmpresa({ empresa }: { empresa: Empresa }) {
  const s = situacaoEfetiva(empresa, hojeISO());
  return (
    <div>
      <div className="mb-3 text-sm text-tinta-400">
        <Link to="/empresas" className="hover:text-marca-700 hover:underline">Empresas</Link> / {empresa.codigo_cadex}
      </div>
      <section className="overflow-hidden rounded-2xl bg-marca-900 text-white shadow-xs">
        <div className="flex flex-wrap items-start gap-5 p-6">
          {empresa.logo_arquivo ? (
            <img src={urlLogo(empresa.logo_arquivo)} alt=""
                 className="h-16 w-16 flex-none rounded-xl bg-white object-contain p-1.5" />
          ) : (
            <div className="grid h-16 w-16 flex-none place-items-center rounded-xl bg-white font-display text-xl font-bold text-marca-900">
              {iniciais(empresa)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-white sm:text-3xl">{nomeEmpresa(empresa)}</h1>
            <p className="mt-1 text-sm text-marca-100/80">{descricaoEmpresa(empresa)}</p>
            <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-sm font-semibold text-white">
              <span className="h-2 w-2 rounded-full" style={{ background: corSelo(s) }} aria-hidden />
              {SITUACAO_LABEL[s]}
            </span>
          </div>
          <div className="ml-auto">
            <Link to={`/empresas/${empresa.id}/ficha`}
                  className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20">
              Imprimir ficha
            </Link>
          </div>
        </div>
        <dl className="grid grid-cols-2 border-t border-white/15 sm:grid-cols-4">
          <Idc rotulo="Código CADEX" valor={empresa.codigo_cadex} mono />
          <Idc rotulo="CNPJ" valor={formatCnpj(empresa.cnpj)} mono />
          <Idc rotulo="Tipo" valor={TIPO_LABEL[empresa.tipo]} />
          <Idc rotulo="Válida até" valor={empresa.validade_ate ? dataBR(empresa.validade_ate) : '—'} mono />
        </dl>
      </section>
    </div>
  );
}

function EmpresaForm({
  inicial, editando, somenteLeitura, empresas, onSubmit,
}: {
  inicial: EmpresaInput;
  editando: boolean;
  somenteLeitura: boolean;
  empresas: Empresa[];
  onSubmit: (input: EmpresaInput, contratantes: string[]) => Promise<void>;
}) {
  const [v, setV] = useState<EmpresaInput>(inicial);
  const [contratantes, setContratantes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [salvo, setSalvo] = useState(false);
  // Empresa já cadastrada abre só para leitura; "Editar dados" libera os campos.
  const [aberto, setAberto] = useState(!editando);
  const travado = somenteLeitura || !aberto;

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
        if (v.tipo === 'terceirizada' && v.setores.length === 0) {
          setError('Marque ao menos um setor em que a terceirizada atua.'); return;
        }
        // Em telecom a terceirizada sempre tem contratante (art. 2º, III). Nos
        // outros setores pode trabalhar para particulares (ex.: drenagem).
        if (!editando && v.tipo === 'terceirizada' && v.setores.includes('telecom') && contratantes.length === 0) {
          setError('Terceirizada de telecomunicações: marque ao menos uma empresa que a contrata.'); return;
        }
        setBusy(true);
        try { await onSubmit(v, contratantes); setSalvo(true); if (editando) setAberto(false); }
        catch (err) { setError(err); }
        finally { setBusy(false); }
      }}
    >
      {editando && !somenteLeitura && !aberto && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
          {salvo && <span className="text-sm text-alta">Alterações salvas.</span>}
          <Button variant="secondary" onClick={() => { setSalvo(false); setAberto(true); }}>Editar dados</Button>
        </div>
      )}
      <fieldset disabled={travado} className="grid gap-4 sm:grid-cols-6">
      <Field label="CNPJ" required className="sm:col-span-2"
             hint={editando ? 'Não pode ser alterado.' : undefined}>
        <input id="cnpj" className={inputClass} required disabled={editando} inputMode="numeric"
               placeholder="00.000.000/0000-00" value={v.cnpj}
               onChange={(e) => set('cnpj', formatCnpj(e.target.value))} />
        {cnpjRuim && <p className="mt-1 text-xs text-baixa">Dígito verificador não confere.</p>}
      </Field>
      <Field label="Razão social" required className="sm:col-span-4">
        <input id="razao" className={inputClass} required {...text('razao_social')} />
      </Field>
      <Field label="Nome fantasia" className="sm:col-span-3">
        <input id="fantasia" className={inputClass} {...text('nome_fantasia')} />
      </Field>
      <Field label="Tipo" required className="sm:col-span-3"
             hint={editando ? 'Não pode ser alterado.'
               : v.tipo === 'construtora' ? 'Pessoa jurídica que constrói imóveis, com licença de obra da Prefeitura. Empreiteira de rede é terceirizada.'
               : undefined}>
        <select id="tipo" className={inputClass} value={v.tipo} disabled={editando}
                onChange={(e) => {
                  const t = e.target.value as EmpresaInput['tipo'];
                  set('tipo', t);
                  set('setores', t === 'operadora' ? ['telecom'] : t === 'construtora' ? ['construcao']
                    : t === 'concessionaria' ? ['gas'] : []);
                }}>
          <option value="operadora">Operadora de telecomunicações</option>
          <option value="concessionaria">Concessionária (gás ou saneamento)</option>
          <option value="construtora">Construtora</option>
          <option value="terceirizada">Terceirizada</option>
        </select>
      </Field>
      {v.tipo === 'concessionaria' && (
        <Field label="Setor" required className="sm:col-span-3"
               hint={editando ? 'Faz parte do código CADEX: não pode ser alterado.' : undefined}>
          <select className={inputClass} value={v.setores[0] ?? 'gas'} disabled={editando}
                  onChange={(e) => set('setores', [e.target.value as Setor])}>
            <option value="gas">Gás</option>
            <option value="saneamento">Saneamento</option>
          </select>
        </Field>
      )}
      {v.tipo === 'terceirizada' && (
        <fieldset className="sm:col-span-6">
          <legend className="text-sm font-medium text-tinta-700">
            Setores em que atua<span className="ml-0.5 text-baixa" aria-hidden>*</span>
          </legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
            {SETORES.map((st) => (
              <label key={st} className="flex items-center gap-2 text-sm text-tinta-700">
                <input type="checkbox" checked={v.setores.includes(st)}
                       onChange={(e) => set('setores', e.target.checked
                         ? SETORES.filter((x) => x === st || v.setores.includes(x))
                         : v.setores.filter((x) => x !== st))} />
                {SETOR_LABEL[st]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!editando && v.tipo === 'terceirizada' && (
        <fieldset className="sm:col-span-6">
          <legend className="text-sm font-medium text-tinta-700">
            Contratada por
            {v.setores.includes('telecom') && <span className="ml-0.5 text-baixa" aria-hidden>*</span>}
          </legend>
          <p className="text-xs text-tinta-500">
            Operadoras, concessionárias, construtoras e, em caso de subcontratação, terceirizadas.
            Obrigatório em telecomunicações; nos outros setores, só se houver.
          </p>
          {empresas.length === 0
            ? <p className="mt-1 text-xs text-tinta-500">Nenhuma empresa cadastrada ainda. Cadastre a contratante primeiro.</p>
            : (['operadora', 'concessionaria', 'construtora', 'terceirizada'] as const).map((t) => {
                const grupo = empresas.filter((o) => o.tipo === t);
                if (grupo.length === 0) return null;
                return (
                  <div key={t} className="mt-2">
                    <div className="text-sm font-semibold text-tinta-700">
                      {{ operadora: 'Operadoras', concessionaria: 'Concessionárias', construtora: 'Construtoras',
                         terceirizada: 'Terceirizadas (subcontratação)' }[t]}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                      {grupo.map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-sm text-tinta-700">
                          <input type="checkbox" checked={contratantes.includes(o.id)}
                                 onChange={(e) => setContratantes((c) =>
                                   e.target.checked ? [...c, o.id] : c.filter((x) => x !== o.id))} />
                          {nomeEmpresa(o)}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
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

      <Field label="Representante legal" className="sm:col-span-6"
             hint="Nome de quem representa a empresa. Entra na relação oficial de executores.">
        <input id="representante" className={inputClass} {...text('representante')} />
      </Field>

      <Field label="Observações" className="sm:col-span-6">
        <textarea id="observacoes" rows={2} className={inputClass} {...text('observacoes')} />
      </Field>

      </fieldset>
      {!travado && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar empresa'}
          </Button>
          {editando && (
            <Button variant="secondary" disabled={busy}
                    onClick={() => { setV(inicial); setError(null); setAberto(false); }}>
              Cancelar
            </Button>
          )}
        </div>
      )}
      <div className="mt-3"><ErrorNote error={error} /></div>
    </form>
  );
}

function LogoEmpresa({
  empresa, podeEditar, onChanged,
}: { empresa: Empresa; podeEditar: boolean; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [inputKey, setInputKey] = useState(0);

  const agir = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); await onChanged(); }
    catch (err) { setError(err); }
    finally { setBusy(false); setInputKey((k) => k + 1); }
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-20 w-20 flex-none items-center justify-center rounded-sm border border-dashed border-tinta-300 bg-tinta-50">
        {empresa.logo_arquivo
          ? <img src={urlLogo(empresa.logo_arquivo)} alt="Logo da empresa" className="h-full w-full object-contain p-1" />
          : <span className="text-xs text-tinta-400">sem logo</span>}
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium text-tinta-700">Logo da empresa</div>
        {podeEditar ? (
          <div className="flex flex-wrap items-center gap-2">
            <input key={inputKey} type="file" aria-label="Logo da empresa" disabled={busy}
                   accept={TIPOS_LOGO.join(',')}
                   className="block max-w-full text-sm text-tinta-600 file:mr-2 file:rounded-sm file:border-0 file:bg-tinta-100 file:px-2 file:py-1 file:text-sm"
                   onChange={(e) => {
                     const f = e.target.files?.[0];
                     if (f) void agir(() => enviarLogo(empresa, f));
                   }} />
            {empresa.logo_arquivo && (
              <Button variant="danger" className="px-2! py-1! text-xs" disabled={busy}
                      onClick={() => { if (window.confirm('Remover o logo?')) void agir(() => removerLogo(empresa)); }}>
                Remover
              </Button>
            )}
          </div>
        ) : null}
        <p className="text-xs text-tinta-500">
          PNG, JPG ou WebP, até {MAX_LOGO_BYTES / 1024 / 1024} MB.
        </p>
        <ErrorNote error={error} />
      </div>
    </div>
  );
}

function Vinculos({
  empresa, todas, podeEditar,
}: { empresa: Empresa; todas: Empresa[]; podeEditar: boolean }) {
  const [vinculos, setVinculos] = useState<Vinculo[] | null>(null);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const recarregar = () =>
    listarVinculos()
      .then((v) => setVinculos(v.filter((x) => x.contratada_id === empresa.id || x.contratante_id === empresa.id)))
      .catch(setError);

  useEffect(() => { void recarregar(); }, [empresa.id]);
  useEffect(() => { listarOrgaos().then(setOrgaos).catch(() => {}); }, []);

  const agir = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); await recarregar(); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  };

  const ehTerceirizada = empresa.tipo === 'terceirizada';
  const lista = vinculos ?? [];
  const contratadaPor = lista.filter((v) => v.contratada_id === empresa.id);
  const contrata = lista.filter((v) => v.contratante_id === empresa.id);

  // Quem ainda pode entrar em cada lado (o banco recusa ciclos na cadeia).
  const podemContratar = todas.filter((o) =>
    o.id !== empresa.id && !contratadaPor.some((v) => v.contratante_id === o.id));
  const orgaosPorId = new Map(orgaos.map((o) => [o.id, o]));
  const podemContratarOrgaos = orgaos.filter((o) => !contratadaPor.some((v) => v.orgao_contratante_id === o.id));
  const podemSerContratadas = todas.filter((o) =>
    o.tipo === 'terceirizada' && o.id !== empresa.id && !contrata.some((v) => v.contratada_id === o.id));

  return (
    <Card title="Vínculos de contratação">
      <ErrorNote error={error} />
      {!vinculos ? <Spinner /> : (
        <div className="space-y-5">
          {ehTerceirizada && (
            <LadoVinculo
              titulo="Contratada por"
              dica="Operadoras, concessionárias, construtoras, órgãos públicos e, em caso de subcontratação, terceirizadas."
              vinculos={contratadaPor}
              outra={(v) => v.contratante_id ?? ''}
              todas={todas}
              orgaosPorId={orgaosPorId}
              vazio="Nenhuma contratante vinculada."
              podeEditar={podeEditar}
              busy={busy}
              opcoes={podemContratar}
              opcoesOrgaos={podemContratarOrgaos}
              rotuloIncluir="Vincular contratante…"
              onIncluir={(id) => agir(() => id.startsWith('orgao:')
                ? criarVinculoOrgao(id.slice('orgao:'.length), empresa.id)
                : criarVinculo(id, empresa.id))}
              onFim={(v) => agir(() => definirFimVinculo(v.id, v.fim ? null : hojeISO()))}
            />
          )}
          <LadoVinculo
            titulo={ehTerceirizada ? 'Subcontratadas' : 'Terceirizadas contratadas'}
            dica={ehTerceirizada
              ? 'Subcontratadas também precisam de inscrição própria no CADEX.'
              : undefined}
            vinculos={contrata}
            outra={(v) => v.contratada_id}
            todas={todas}
            vazio={ehTerceirizada ? 'Nenhuma subcontratada.' : 'Nenhuma terceirizada vinculada.'}
            podeEditar={podeEditar}
            busy={busy}
            opcoes={podemSerContratadas}
            rotuloIncluir={ehTerceirizada ? 'Vincular subcontratada…' : 'Vincular terceirizada…'}
            onIncluir={(id) => agir(() => criarVinculo(empresa.id, id))}
            onFim={(v) => agir(() => definirFimVinculo(v.id, v.fim ? null : hojeISO()))}
          />
        </div>
      )}
    </Card>
  );
}

function LadoVinculo({
  titulo, dica, vinculos, outra, todas, orgaosPorId, vazio, podeEditar, busy, opcoes, opcoesOrgaos, rotuloIncluir, onIncluir, onFim,
}: {
  titulo: string;
  dica?: string;
  vinculos: Vinculo[];
  outra: (v: Vinculo) => string;
  todas: Empresa[];
  /** Órgãos públicos, para exibir o vínculo cuja contratante é um órgão. */
  orgaosPorId?: Map<string, Orgao>;
  vazio: string;
  podeEditar: boolean;
  busy: boolean;
  opcoes: Empresa[];
  /** Órgãos públicos oferecidos no seletor (só no lado "Contratada por"). */
  opcoesOrgaos?: Orgao[];
  rotuloIncluir: string;
  onIncluir: (id: string) => Promise<void>;
  onFim: (v: Vinculo) => Promise<void>;
}) {
  const [nova, setNova] = useState('');
  const porId = new Map(todas.map((e) => [e.id, e]));

  return (
    <div>
      <h3 className="text-sm font-semibold text-tinta-700">{titulo}</h3>
      {dica && <p className="text-xs text-tinta-500">{dica}</p>}
      {vinculos.length === 0 ? (
        <p className="mt-2 text-sm text-tinta-500">{vazio}</p>
      ) : (
        <ul className="mt-1 divide-y divide-tinta-100">
          {vinculos.map((v) => {
            const e = porId.get(outra(v));
            const o = v.orgao_contratante_id ? orgaosPorId?.get(v.orgao_contratante_id) : undefined;
            return (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  {o ? (
                    <>
                      <span className="font-medium text-tinta-800">{nomeOrgao(o)}</span>
                      <span className="ml-2"><Badge>Órgão público</Badge></span>
                    </>
                  ) : e ? (
                    <>
                      <Link to={`/empresas/${e.id}`} className="font-medium text-marca-700 hover:underline">
                        {nomeEmpresa(e)}
                      </Link>
                      <span className="tabular ml-2 text-xs text-tinta-500">{e.codigo_cadex}</span>
                      <span className="ml-2 text-xs text-tinta-500">{TIPO_LABEL[e.tipo]}</span>
                    </>
                  ) : '—'}
                  <div className="text-xs text-tinta-500">
                    desde {dataBR(v.inicio)}{v.fim && `, encerrado em ${dataBR(v.fim)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {e && <SituacaoBadge s={situacaoEfetiva(e, hojeISO())} />}
                  <Badge tom={v.fim ? 'neutro' : 'bom'}>{v.fim ? 'Encerrado' : 'Ativo'}</Badge>
                  {podeEditar && (
                    <Button variant="secondary" className="px-2! py-1! text-xs" disabled={busy}
                            onClick={() => void onFim(v)}>
                      {v.fim ? 'Reativar' : 'Encerrar'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {podeEditar && (opcoes.length > 0 || (opcoesOrgaos?.length ?? 0) > 0) && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select aria-label={rotuloIncluir} className={`${inputClass} w-auto!`} value={nova}
                  onChange={(e) => setNova(e.target.value)}>
            <option value="">{rotuloIncluir}</option>
            {opcoesOrgaos && opcoesOrgaos.length > 0 ? (
              <>
                <optgroup label="Empresas">
                  {opcoes.map((o) => (
                    <option key={o.id} value={o.id}>{nomeEmpresa(o)} ({o.codigo_cadex})</option>
                  ))}
                </optgroup>
                <optgroup label="Órgãos públicos">
                  {opcoesOrgaos.map((o) => (
                    <option key={o.id} value={`orgao:${o.id}`}>{nomeOrgao(o)}</option>
                  ))}
                </optgroup>
              </>
            ) : (
              opcoes.map((o) => (
                <option key={o.id} value={o.id}>{nomeEmpresa(o)} ({o.codigo_cadex})</option>
              ))
            )}
          </select>
          <Button variant="secondary" disabled={busy || !nova}
                  onClick={() => void onIncluir(nova).then(() => setNova(''))}>
            Vincular
          </Button>
        </div>
      )}
    </div>
  );
}

const TOM_ESTADO: Record<EstadoDocumento, Tom> = {
  pendente: 'ruim', ok: 'bom', vence_em_breve: 'alerta', vencido: 'ruim',
};

type Marcacao = { status: 'pendente' | 'entregue'; validade: string };

const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * Documentos do art. 6º. A SECONSER marca cada um como entregue ou
 * pendente (e a validade, nos que vencem); as mudanças ficam em rascunho
 * até "Salvar documentos", que grava todas de uma vez.
 */
function Documentos({ empresa }: { empresa: Empresa }) {
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [rascunho, setRascunho] = useState<Record<string, Marcacao>>({});
  const [error, setError] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const recarregar = () =>
    Promise.all([listarTiposDocumento(), listarDocumentos(empresa.id)])
      // Só os documentos exigidos do perfil da empresa (telecom, gás, saneamento, construtora, terceirizada).
      .then(([t, d]) => { setTipos(tiposDaEmpresa(t, empresa)); setDocs(d); setRascunho({}); })
      .catch(setError)
      .finally(() => setLoading(false));

  useEffect(() => { void recarregar(); }, [empresa.id]);

  const hoje = hojeISO();
  const ultimos = ultimoPorTipo(docs);
  const salvo = (codigo: string): Marcacao => {
    const d = ultimos.get(codigo);
    return { status: d?.status ?? 'pendente', validade: d?.validade ?? '' };
  };
  const atual = (codigo: string) => rascunho[codigo] ?? salvo(codigo);

  const alterados = tipos.filter((t) => {
    const r = rascunho[t.codigo];
    if (!r) return false;
    const s0 = salvo(t.codigo);
    return r.status !== s0.status || (r.status === 'entregue' && r.validade !== s0.validade);
  });
  const semValidade = alterados.filter(
    (t) => t.tem_validade && atual(t.codigo).status === 'entregue' && !atual(t.codigo).validade,
  );

  const marcar = (codigo: string, m: Partial<Marcacao>) => {
    setAviso(null); setError(null);
    setRascunho((r) => ({ ...r, [codigo]: { ...atual(codigo), ...m } }));
  };

  const salvar = async () => {
    setSalvando(true); setError(null); setAviso(null);
    try {
      await registrarDocumentos(empresa.id, alterados.map((t) => ({
        tipo: t.codigo, status: atual(t.codigo).status, validade: atual(t.codigo).validade || null,
      })));
      const n = alterados.length;
      await recarregar();
      setAviso(`${n} documento${n > 1 ? 's' : ''} salvo${n > 1 ? 's' : ''}.`);
    } catch (err) { setError(err); } finally { setSalvando(false); }
  };

  const barra = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {aviso && <span role="status" className="text-sm font-medium text-alta">{aviso}</span>}
      {semValidade.length > 0 && (
        <span className="text-sm text-baixa">Informe a validade de: {semValidade.map((t) => t.nome).join(', ')}.</span>
      )}
      {alterados.length > 0 && (
        <Button variant="secondary" disabled={salvando} onClick={() => { setRascunho({}); setAviso(null); }}>
          Descartar
        </Button>
      )}
      <Button disabled={salvando || alterados.length === 0 || semValidade.length > 0} onClick={() => void salvar()}>
        {salvando ? 'Salvando…' : alterados.length > 0 ? `Salvar documentos (${alterados.length})` : 'Salvar documentos'}
      </Button>
    </div>
  );

  return (
    <Card
      title="Documentos"
      action={!loading && <ResumoBadge r={resumoDocumentos(tipos, docs, hoje)} />}
    >
      <ErrorNote error={error} />
      {loading ? <Spinner /> : (
        <>
          <ul className="divide-y divide-tinta-100">
            {tipos.map((t) => (
              <LinhaDocumento
                key={t.codigo}
                tipo={t}
                doc={ultimos.get(t.codigo)}
                estado={estadoDocumento(t, ultimos.get(t.codigo), hoje)}
                marcacao={atual(t.codigo)}
                alterado={alterados.includes(t)}
                disabled={salvando}
                onMarcar={(m) => marcar(t.codigo, m)}
              />
            ))}
          </ul>
          <div className="sticky bottom-0 -mx-5 -mb-5 mt-2 rounded-b-md border-t border-tinta-200 bg-white/95 px-5 py-3 backdrop-blur-sm">
            {barra}
          </div>
        </>
      )}
    </Card>
  );
}

function LinhaDocumento({
  tipo, doc, estado, marcacao, alterado, disabled, onMarcar,
}: {
  tipo: TipoDocumento;
  doc: Documento | undefined;
  estado: EstadoDocumento;
  marcacao: Marcacao;
  alterado: boolean;
  disabled: boolean;
  onMarcar: (m: Partial<Marcacao>) => void;
}) {
  const exibirEstado = estado === 'pendente' && !tipo.obrigatorio ? null : estado;
  const nome = `status-${tipo.codigo}`;

  return (
    <li className={`py-3 ${alterado ? '-mx-5 bg-atencao/6 px-5' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-tinta-800">{tipo.nome}</div>
          <div className="text-xs text-tinta-500">
            {tipo.obrigatorio ? 'Obrigatório' : 'Quando aplicável'}
            {doc && <> · última marcação em {dataBR(doc.enviado_em)}</>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-tinta-700">
              <input type="radio" name={nome} checked={marcacao.status === 'pendente'} disabled={disabled}
                     onChange={() => onMarcar({ status: 'pendente' })} />
              Pendente
            </label>
            <label className="flex items-center gap-2 text-sm text-tinta-700">
              <input type="radio" name={nome} checked={marcacao.status === 'entregue'} disabled={disabled}
                     onChange={() => onMarcar({ status: 'entregue' })} />
              Entregue
            </label>
            {tipo.tem_validade && marcacao.status === 'entregue' && (
              <label className="flex items-center gap-2 text-sm text-tinta-700">
                válido até
                <input type="date" className={`${inputClass} w-auto! py-1!`} value={marcacao.validade}
                       disabled={disabled} required
                       onChange={(e) => onMarcar({ validade: e.target.value })} />
              </label>
            )}
            {alterado && <span className="text-xs font-medium text-atencao">alterado, falta salvar</span>}
          </div>
        </div>
        {exibirEstado && <Badge tom={TOM_ESTADO[exibirEstado]}>{ESTADO_LABEL[exibirEstado]}</Badge>}
      </div>
    </li>
  );
}
