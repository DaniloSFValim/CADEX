import { Suspense, lazy, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorNote, Field, Spinner, Titulo, botaoLink, inputClass, linkTexto } from '../components/ui';
import { QrCode } from '../components/QrCode';
import { ExcluirLicenca } from '../components/ExclusaoLicenca';
import { SituacaoBadge, dataBR } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj, formatCpf, isValidCnpj, isValidCpf, onlyDigits } from '../lib/cnpj';
import { buscarCep, cepValido, formatCep } from '../lib/cep';
import {
  SETORES, SETOR_LABEL, atuaNoSetor, ehContratante, hojeISO, listarDaEmpresa, listarEmpresas, listarVinculos,
  nomeEmpresa, podeAtuar, situacaoEfetiva, type Empresa, type Registro, type Setor, type Vinculo,
} from '../lib/empresas';
import {
  ESTADO_LICENCA_LABEL, ORIGENS, ORIGEM_LABEL, TIPOS_INTERVENCAO, TIPO_INTERVENCAO_LABEL, origemPublica, TOM_ESTADO_LICENCA, buscarConflitos, buscarLicenca, prorrogarLicenca,
  anteriorResolucao, coordenadaTexto, segueResolucao, estadoLicenca, lerCoordenada, linkMapa, salvarLicenca,
  erroPeriodoObra, mesmaEmpresaNosPapeis, situacoesRegistraveis,
  urlPublicaLicenca,
  type Conflito, type LicencaComTrechos, type LicencaInput, type OrigemIntervencao, type SituacaoLicenca, type TipoIntervencao, type TipoObra, type Trecho,
} from '../lib/licencas';
import { listarOrgaos, nomeOrgao, orgaoServeOrigem, type Orgao } from '../lib/orgaos';
import { listarTipos, type TipoIntervencao as TipoDeObra } from '../lib/tiposIntervencao';
import { areaParaGeoJson, lerAreaWkb, problemaArea, type Anel } from '../lib/areaTrecho';

const DesenhoArea = lazy(() => import('../components/DesenhoArea'));

/** Ponto: só o início. Segmento: início e fim. Área: polígono (o início é o primeiro vértice). */
type TipoTrechoForm = 'ponto' | 'segmento' | 'area';
interface TrechoForm { id?: string; cep: string; logradouro: string; bairro: string; referencia: string; inicio: string; fim: string; area: Anel | null; tipo: TipoTrechoForm }

type Form = {
  setor: Setor; processo_sei: string; numero: string; tipos_obra: TipoObra[]; outros_descricao: string; escopo: string; observacoes: string;
  /** Vazio até o usuário escolher: o campo é obrigatório. */
  tipo_intervencao: TipoIntervencao | ''; origem_intervencao: OrigemIntervencao;
  contrato_numero: string; processo_administrativo: string; ordem_servico_numero: string; objeto_contrato: string;
  executora_id: string; contratante_id: string; subcontratada_id: string; responsavel_tecnico_id: string;
  executora_razao_social: string; executora_cnpj: string; contratante_razao_social: string;
  /** CNPJ, ou CPF do dono do imóvel na drenagem. */
  contratante_cnpj: string;
  imovel_endereco: string; processo_urbanismo: string;
  art_numero: string; protocolo_data: string; situacao: SituacaoLicenca;
  inicio_previsto: string; fim_previsto: string; concluida_em: string; recomposicao_data: string;
  as_built_sei: string; as_built_data: string;
};

/** Opção do seletor para empresa sem cadastro (só em licença anterior à Resolução). */
const SEM_CADASTRO = '__sem_cadastro__';
/** Prefixo no valor da contratante quando ela é um órgão público (vs. empresa). */
const ORGAO_PREFIXO = 'orgao:';
/** Órgão que contrata neste setor (sem setores = sem restrição). */
const orgaoNoSetor = (o: Orgao, s: Setor) => o.setores.length === 0 || o.setores.includes(s);

/** Situação como o registro enxerga: o ciclo da obra. */
type UiSituacao = 'em_execucao' | 'concluida' | 'indeferida' | 'cancelada';
const UI_SITUACAO_LABEL: Record<UiSituacao, string> = {
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  indeferida: 'Indeferida',
  cancelada: 'Cancelada',
};
/** Ciclo da obra → situação administrativa gravada no banco. */
const SITUACAO_DE_UI: Record<UiSituacao, SituacaoLicenca> = {
  em_execucao: 'deferida', concluida: 'deferida', indeferida: 'indeferida', cancelada: 'cancelada',
};
/** Em execução e concluída são "deferida"; a conclusão distingue pela data. */
function uiDaSituacao(situacao: SituacaoLicenca, concluidaEm: string): UiSituacao {
  if (situacao === 'cancelada') return 'cancelada';
  if (situacao === 'indeferida') return 'indeferida';
  return concluidaEm ? 'concluida' : 'em_execucao';
}

const TRECHO_VAZIO: TrechoForm = { cep: '', logradouro: '', bairro: '', referencia: '', inicio: '', fim: '', area: null, tipo: 'ponto' };
const ROTULO_TIPO_TRECHO: Record<TipoTrechoForm, string> = { ponto: 'Ponto', segmento: 'Segmento', area: 'Área' };

const VAZIO: Form = {
  setor: 'telecom', processo_sei: '', numero: '', tipos_obra: [], outros_descricao: '', escopo: '', observacoes: '',
  tipo_intervencao: '', origem_intervencao: 'concessionaria',
  contrato_numero: '', processo_administrativo: '', ordem_servico_numero: '', objeto_contrato: '',
  executora_id: '', contratante_id: '', subcontratada_id: '', responsavel_tecnico_id: '',
  executora_razao_social: '', executora_cnpj: '', contratante_razao_social: '', contratante_cnpj: '',
  imovel_endereco: '', processo_urbanismo: '',
  art_numero: '', protocolo_data: '', situacao: 'deferida',
  inicio_previsto: '', fim_previsto: '', concluida_em: '', recomposicao_data: '', as_built_sei: '', as_built_data: '',
};

function paraForm(l: LicencaComTrechos): Form {
  const s = (v: string | null) => v ?? '';
  return {
    setor: l.setor, processo_sei: l.processo_sei, numero: s(l.numero), tipos_obra: l.tipos_obra,
    outros_descricao: s(l.outros_descricao ?? null), escopo: l.escopo,
    observacoes: s(l.observacoes),
    tipo_intervencao: l.tipo_intervencao, origem_intervencao: l.origem_intervencao,
    contrato_numero: s(l.contrato_numero), processo_administrativo: s(l.processo_administrativo),
    ordem_servico_numero: s(l.ordem_servico_numero), objeto_contrato: s(l.objeto_contrato),
    executora_id: l.executora_id ?? (l.executora_razao_social ? SEM_CADASTRO : ''),
    contratante_id: l.orgao_contratante_id ? `${ORGAO_PREFIXO}${l.orgao_contratante_id}`
      : l.contratante_id ?? (l.contratante_razao_social ? SEM_CADASTRO : ''),
    executora_razao_social: s(l.executora_razao_social), executora_cnpj: l.executora_cnpj ? formatCnpj(l.executora_cnpj) : '',
    contratante_razao_social: s(l.contratante_razao_social), contratante_cnpj: l.contratante_cpf ? formatCpf(l.contratante_cpf) : l.contratante_cnpj ? formatCnpj(l.contratante_cnpj) : '',
    imovel_endereco: s(l.imovel_endereco), processo_urbanismo: s(l.processo_urbanismo),
    subcontratada_id: s(l.subcontratada_id), responsavel_tecnico_id: s(l.responsavel_tecnico_id),
    art_numero: s(l.art_numero), protocolo_data: l.protocolo_data, situacao: l.situacao,
    inicio_previsto: s(l.inicio_previsto), fim_previsto: s(l.fim_previsto),
    concluida_em: s(l.concluida_em), recomposicao_data: s(l.recomposicao_data),
    as_built_sei: s(l.as_built_sei), as_built_data: s(l.as_built_data),
  };
}

const trechoParaForm = (t: Trecho & { id: string }): TrechoForm => ({
  id: t.id, cep: '', logradouro: t.logradouro, bairro: t.bairro ?? '', referencia: t.referencia ?? '',
  inicio: coordenadaTexto(t.inicio_lat, t.inicio_lng),
  fim: t.fim_lat != null && t.fim_lng != null ? coordenadaTexto(t.fim_lat, t.fim_lng) : '',
  area: lerAreaWkb(t.area),
  tipo: lerAreaWkb(t.area) ? 'area' : t.fim_lat != null && t.fim_lng != null ? 'segmento' : 'ponto',
});

export default function LicencaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { podeLicenciar, servidor } = useAuth();
  const administrador = Boolean(servidor?.administrador);
  const [licenca, setLicenca] = useState<LicencaComTrechos | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [tiposCatalogo, setTiposCatalogo] = useState<TipoDeObra[]>([]);

  useEffect(() => {
    setLicenca(null);
    Promise.all([id ? buscarLicenca(id) : Promise.resolve(null), listarEmpresas(), listarVinculos(), listarOrgaos(), listarTipos()])
      .then(([l, e, v, o, t]) => { setLicenca(l); setEmpresas(e); setVinculos(v); setOrgaos(o); setTiposCatalogo(t); })
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
        acoes={licenca && administrador && !licenca.excluida_em && (
          <ExcluirLicenca licenca={licenca} empresas={new Map(empresas.map((e) => [e.id, e]))} orgaos={orgaos} hoje={hoje}
                          onExcluida={(aviso) => navigate('/admin/licencas', { state: { aviso } })} />
        )}
        titulo={licenca ? (licenca.numero ? `Licença ${licenca.numero}` : 'Pedido de licença') : 'Registrar licença'}
        descricao={licenca
          ? <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tom={TOM_ESTADO_LICENCA[estado!]}>{ESTADO_LICENCA_LABEL[estado!]}</Badge>
              <Badge>{SETOR_LABEL[licenca.setor]}</Badge>
              {licenca.setor === 'telecom' && licenca.anterior_resolucao && <Badge>Anterior à Resolução</Badge>}
              <span>Processo {licenca.processo_sei}, protocolado em {dataBR(licenca.protocolo_data)}.</span>
            </span>
          : 'Lance os dados do processo: executora habilitada no setor, trechos da obra e a situação (em execução ou concluída).'}
      />
      {licenca?.excluida_em && (
        <p role="status" className="mb-6 rounded-sm border-l-4 border-baixa bg-baixa/6 px-3 py-2 text-sm text-tinta-800">
          Esta licença está na lixeira (excluída em {dataBR(licenca.excluida_em.slice(0, 10))}
          {licenca.excluida_motivo && `: ${licenca.excluida_motivo}`}). Não aparece nas listas, no mapa nem na consulta pública.{' '}
          <Link to="/admin/licencas" className="font-semibold underline">Ir para a lixeira</Link>
        </p>
      )}
      {/* Obra já concluída não precisa de placa nem de QR Code. */}
      {licenca?.situacao === 'deferida' && !licenca.excluida_em && !licenca.concluida_em && <Placa licenca={licenca} />}
      {licenca?.situacao === 'deferida' && !licenca.excluida_em && (
        <Validade licenca={licenca} hoje={hoje} onProrrogada={async () => setLicenca(await buscarLicenca(licenca.id))} />
      )}
      {licenca && <Conflitos key={licenca.atualizado_em} licencaId={licenca.id} />}
      <LicencaForm
        key={licenca?.id ?? 'nova'}
        licenca={licenca}
        tipos={tiposCatalogo}
        empresas={empresas}
        vinculos={vinculos}
        orgaos={orgaos}
        somenteLeitura={!podeLicenciar || Boolean(licenca?.excluida_em)}
        onSalvo={async (novoId) => {
          if (!licenca) navigate(`/obras/${novoId}`, { replace: true });
          else setLicenca(await buscarLicenca(novoId));
        }}
      />
    </>
  );
}

function LicencaForm({ licenca, empresas, vinculos, orgaos, tipos, somenteLeitura, onSalvo }: {
  licenca: LicencaComTrechos | null; empresas: Empresa[]; vinculos: Vinculo[]; orgaos: Orgao[]; tipos: TipoDeObra[]; somenteLeitura: boolean;
  onSalvo: (id: string) => Promise<void>;
}) {
  const [f, setF] = useState<Form>(licenca ? paraForm(licenca) : { ...VAZIO, protocolo_data: hojeISO() });
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
  // Empresa desativada (Administração) não entra em licença nova; a que esta licença já usa continua listada.
  const jaUsadas = new Set([licenca?.executora_id, licenca?.contratante_id, licenca?.subcontratada_id].filter(Boolean));
  const ativaOuJaUsada = (e: Empresa) => e.ativa || jaUsadas.has(e.id);
  // Tipos de obra do setor escolhido: os ativos, mais os já marcados nesta licença.
  const tiposDoSetor = tipos.filter((t) => t.setor === f.setor && (t.ativo || f.tipos_obra.includes(t.codigo as TipoObra)));

  // Executora: empresa HABILITADA (deferida/apta) que atua no setor da licença.
  const executoras = empresas.filter((e) => ativaOuJaUsada(e) && atuaNoSetor(e, f.setor) && podeAtuar(situacaoEfetiva(e, hoje)));
  const publica = origemPublica(f.origem_intervencao);
  // Contratante: titular (operadora, concessionária ou construtora) do setor. Inclui a
  // própria executora: a titular que executa a própria obra é contratante e executora.
  const contratantes = publica ? []
    : empresas.filter((e) => ativaOuJaUsada(e) && ehContratante(e.tipo) && atuaNoSetor(e, f.setor));

  // Responsáveis técnicos da executora e da subcontratada.
  useEffect(() => {
    const ids = [f.executora_id, f.subcontratada_id].filter((i) => i && i !== SEM_CADASTRO);
    Promise.all(ids.map((i) => listarDaEmpresa('responsaveis_tecnicos', i)))
      .then((r) => setRts(r.flat()))
      .catch(setError);
  }, [f.executora_id, f.subcontratada_id]);

  const deferindo = f.situacao === 'deferida';
  const uiSituacao = uiDaSituacao(f.situacao, f.concluida_em);
  const setUiSituacao = (u: UiSituacao) => {
    set('situacao', SITUACAO_DE_UI[u]);
    if (u === 'concluida') { if (!f.concluida_em) set('concluida_em', hoje); }
    else set('concluida_em', '');
  };
  const anterior = anteriorResolucao(f.protocolo_data || null);
  // Regras da Resolução (APTA, ART, vínculo da subcontratada): só telecom a partir de 09/09/2026.
  const resolucao = segueResolucao(f.setor, f.protocolo_data || null);
  const drenagem = f.setor === 'drenagem';
  const executoraSemCadastro = f.executora_id === SEM_CADASTRO;
  const contratanteSemCadastro = f.contratante_id === SEM_CADASTRO;
  // Contratante órgão público: o valor do seletor vem com o prefixo "orgao:".
  const contratanteOrgaoId = f.contratante_id.startsWith(ORGAO_PREFIXO)
    ? f.contratante_id.slice(ORGAO_PREFIXO.length) : null;
  // Origem pública: só os órgãos que servem a ela. Concessionária: só empresas, nenhum órgão.
  const orgaosDoSetor = publica
    ? orgaos.filter((o) => orgaoNoSetor(o, f.setor) && orgaoServeOrigem(o, f.origem_intervencao)) : [];
  // Na drenagem o dono do imóvel pode ser pessoa física: 11 dígitos = CPF.
  const contratanteCpf = drenagem && contratanteSemCadastro && onlyDigits(f.contratante_cnpj).length <= 11
    && f.contratante_cnpj.trim() !== '';
  // A terceirizada sempre trabalha para uma contratante. A titular (operadora,
  // concessionária, construtora) executa a própria obra: sem contratante, ou ela
  // mesma como contratante (a opção "a própria contratante executará").
  const executoraTerceirizada = executora?.tipo === 'terceirizada';
  const contratanteObrigatoria = publica || (executoraTerceirizada && !anterior);
  // Contratante empresa cadastrada (nem órgão público, nem empresa sem cadastro).
  const contratanteEmpresaId = f.contratante_id && f.contratante_id !== SEM_CADASTRO
    && !f.contratante_id.startsWith(ORGAO_PREFIXO) ? f.contratante_id : '';
  // Mesma pessoa jurídica nos dois papéis: um único cadastro, derivado dos dois campos.
  const mesmaEmpresa = mesmaEmpresaNosPapeis({ contratante_id: contratanteEmpresaId || null, executora_id: f.executora_id || null });
  // Só quem pode executar (habilitada e atuante no setor) pode ser contratante e executora.
  const contratanteEmpresa = contratanteEmpresaId ? porId.get(contratanteEmpresaId) : undefined;
  const podeExecutar = Boolean(contratanteEmpresa) && executoras.some((e) => e.id === contratanteEmpresaId);
  // Além de poder executar, o cadastro da empresa precisa dizer que ela executa obra ou serviço própria.
  // A licença que já está assim continua editável, mesmo que a marca tenha sido tirada depois.
  const cadastroHabilita = Boolean(contratanteEmpresa?.executa_obras) || mesmaEmpresa;
  const podeAutoExecutar = podeExecutar && cadastroHabilita;
  // Fora da drenagem e do histórico, a titular não executa para outra contratante:
  // havendo contratante, a executora é terceirizada ou a própria contratante.
  const titularLivre = drenagem || anterior;
  // Sob a Resolução: só subcontratada com vínculo ativo. Fora dela: qualquer terceirizada do setor.
  const subcontratadas = (!resolucao
    ? empresas.filter((e) => ativaOuJaUsada(e) && e.tipo === 'terceirizada' && e.id !== f.executora_id)
    : vinculos
      .filter((v) => v.contratante_id === f.executora_id && !v.fim)
      .map((v) => porId.get(v.contratada_id))
      .filter((e): e is Empresa => Boolean(e))).filter((e) => ativaOuJaUsada(e) && atuaNoSetor(e, f.setor));
  // Com contratante definida (e fora da drenagem e do histórico), a executora é
  // terceirizada ou a própria contratante; a titular não executa para outra.
  const executorasLista = executoras.filter((e) =>
    titularLivre || !f.contratante_id || e.tipo === 'terceirizada'
    || (e.id === contratanteEmpresaId && (e.executa_obras || mesmaEmpresa)));
  const limparPartesDaExecutora = () => { set('subcontratada_id', ''); set('responsavel_tecnico_id', ''); };
  const trocarContratante = (novo: string) => {
    const executoraTitular = executora && executora.tipo !== 'terceirizada';
    set('contratante_id', novo);
    if (mesmaEmpresa) {
      // A executora acompanha a contratante; se a nova não pode executar, volta a escolher.
      const nova = porId.get(novo);
      const serve = nova && ehContratante(nova.tipo) && nova.executa_obras && executoras.some((e) => e.id === nova.id);
      set('executora_id', serve ? novo : '');
      limparPartesDaExecutora();
    } else if (novo && executoraTitular && !titularLivre && novo !== f.executora_id) {
      // A titular não executa para outra contratante: escolhe-se a executora de novo.
      set('executora_id', '');
      limparPartesDaExecutora();
    }
  };
  const trocarOrigem = (nova: OrigemIntervencao) => {
    set('origem_intervencao', nova);
    // Contratante de outra natureza sai; a execução própria não existe em contrato público.
    if (origemPublica(nova)) {
      if (mesmaEmpresa) { set('executora_id', ''); limparPartesDaExecutora(); }
      const o = orgaos.find((x) => `${ORGAO_PREFIXO}${x.id}` === f.contratante_id);
      if (!o || !orgaoServeOrigem(o, nova)) set('contratante_id', '');
    } else if (contratanteOrgaoId) set('contratante_id', '');
  };
  const marcarAutoExecucao = (marcado: boolean) => {
    set('executora_id', marcado ? contratanteEmpresaId : '');
    limparPartesDaExecutora();
  };
  const setTrecho =(i: number, k: keyof TrechoForm, v: string) => {
    setTrechos((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
    setSalvo(false);
  };
  // Trocar o tipo limpa o que não se aplica ao novo tipo (fim fora do segmento, área fora da área).
  const setTipoTrecho = (i: number, tipo: TipoTrechoForm) => {
    setTrechos((ts) => ts.map((t, j) => (j === i ? {
      ...t, tipo,
      fim: tipo === 'segmento' ? t.fim : '',
      area: tipo === 'area' ? t.area : null,
    } : t)));
    setSalvo(false);
  };
  // O mapa de marcação grava nos campos do formulário (texto de coordenadas e área).
  const marcarNoMapa = (i: number, p: { inicio?: [number, number] | null; fim?: [number, number] | null; area?: Anel | null }) => {
    setTrechos((ts) => ts.map((t, j) => {
      if (j !== i) return t;
      const next = { ...t };
      if (p.inicio !== undefined) next.inicio = p.inicio ? coordenadaTexto(p.inicio[1], p.inicio[0]) : '';
      if (p.fim !== undefined) next.fim = p.fim ? coordenadaTexto(p.fim[1], p.fim[0]) : '';
      if (p.area !== undefined) next.area = p.area;
      return next;
    }));
    setSalvo(false);
  };
  // Qual trecho está com o mapa de desenho aberto (um por vez, para o mapa não pesar).
  const [areaAberta, setAreaAberta] = useState<number | null>(null);
  // CEP preenche logradouro e bairro; as coordenadas continuam à mão.
  const buscarCepTrecho = async (i: number, cep: string) => {
    if (!cepValido(cep)) return;
    setError(null);
    try {
      const end = await buscarCep(cep);
      if (!end) { setError(new Error('CEP não encontrado.')); return; }
      setTrechos((ts) => ts.map((t, j) => (j === i
        ? { ...t, logradouro: end.logradouro || t.logradouro, bairro: end.bairro || t.bairro } : t)));
      setSalvo(false);
    } catch (err) { setError(err); }
  };

  function montar(): { licenca: LicencaInput; trechos: Trecho[] } | string {
    if (!f.processo_sei.trim()) return 'Informe o número do processo.';
    if (!f.tipo_intervencao) return 'Escolha o tipo de intervenção: obra ou serviço.';
    if (publica && !contratanteOrgaoId) return 'Obra ou serviço público: escolha o órgão ou a autarquia contratante.';
    if (executoraSemCadastro && !anterior) {
      return 'Executora sem cadastro no CADEX só em licença com protocolo anterior a 09/09/2026. Cadastre a empresa ou corrija a data de protocolo.';
    }
    if (contratanteSemCadastro && !anterior && !drenagem) {
      return 'Contratante sem cadastro no CADEX só em drenagem ou em licença com protocolo anterior a 09/09/2026.';
    }
    if (executoraSemCadastro && !f.executora_razao_social.trim()) return 'Informe a razão social da executora.';
    if (contratanteSemCadastro && !f.contratante_razao_social.trim()) return 'Informe a razão social da contratante.';
    if (f.executora_cnpj.trim() && !isValidCnpj(f.executora_cnpj)) return 'CNPJ da executora inválido.';
    if (contratanteCpf ? !isValidCpf(f.contratante_cnpj) : f.contratante_cnpj.trim() && !isValidCnpj(f.contratante_cnpj)) {
      return drenagem ? 'CPF ou CNPJ do dono do imóvel inválido.' : 'CNPJ da contratante inválido.';
    }
    if (drenagem && !anterior) {
      if (!f.imovel_endereco.trim()) return 'Drenagem: informe o endereço do imóvel atendido.';
      if (!f.processo_urbanismo.trim()) return 'Drenagem: informe o processo de licenciamento da obra no Urbanismo.';
      if (contratanteSemCadastro && !f.contratante_cnpj.trim()) return 'Drenagem: informe o CPF ou o CNPJ do dono do imóvel.';
      if (!f.contratante_id && executora?.tipo !== 'construtora') return 'Drenagem: informe o dono do imóvel ou a construtora contratante.';
    }
    if (f.tipos_obra.length === 0) return 'Marque ao menos um tipo de obra (art. 10).';
    if (f.tipos_obra.includes('outros') && !f.outros_descricao.trim()) {
      return 'Descreva o tipo "Outros" no campo de descrição.';
    }
    const erroPeriodo = erroPeriodoObra({
      deferida: deferindo, inicio: f.inicio_previsto, fim: f.fim_previsto, concluidaEm: f.concluida_em,
    });
    if (erroPeriodo) return erroPeriodo;
    const lista: Trecho[] = [];
    for (const [i, t] of trechos.entries()) {
      const n = trechos.length > 1 ? ` ${i + 1}` : '';
      if (!t.logradouro.trim()) return `Trecho${n}: informe o logradouro.`;
      const area = t.tipo === 'area' && t.area && t.area.length > 0 ? t.area : null;
      if (t.tipo === 'area') {
        const erroArea = area ? problemaArea(area) : 'marque pelo menos 3 pontos da área no mapa.';
        if (erroArea) return `Trecho${n}: área da intervenção. ${erroArea}`;
      }
      // Na área, o início é o primeiro vértice; nos outros tipos, é o que foi digitado ou marcado.
      const ini = area ? { lat: area[0][1], lng: area[0][0] } : lerCoordenada(t.inicio);
      if (!ini) return `Trecho${n}: coordenada de início não reconhecida ou fora de Niterói.`;
      if (t.tipo === 'segmento' && !t.fim.trim()) return `Trecho${n}: informe o fim do segmento, ou escolha Ponto.`;
      const fim = t.tipo === 'segmento' && t.fim.trim() ? lerCoordenada(t.fim) : null;
      if (t.tipo === 'segmento' && t.fim.trim() && !fim) return `Trecho${n}: coordenada de fim não reconhecida ou fora de Niterói.`;
      lista.push({
        ...(t.id ? { id: t.id } : {}), logradouro: t.logradouro.trim(), bairro: t.bairro.trim() || null,
        referencia: t.referencia.trim() || null, inicio_lat: ini.lat, inicio_lng: ini.lng,
        fim_lat: fim?.lat ?? null, fim_lng: fim?.lng ?? null,
        area: area ? areaParaGeoJson(area) : null,
      });
    }
    const n = (v: string) => v.trim() || null;
    return {
      licenca: {
        ...(licenca ? { id: licenca.id } : {}),
        setor: f.setor, processo_sei: f.processo_sei, numero: n(f.numero), tipos_obra: f.tipos_obra,
        outros_descricao: f.tipos_obra.includes('outros') ? n(f.outros_descricao) : null,
        escopo: f.escopo.trim(),
        observacoes: n(f.observacoes),
        tipo_intervencao: f.tipo_intervencao as TipoIntervencao,
        origem_intervencao: f.origem_intervencao,
        contrato_numero: publica ? n(f.contrato_numero) : null,
        processo_administrativo: publica ? n(f.processo_administrativo) : null,
        ordem_servico_numero: publica ? n(f.ordem_servico_numero) : null,
        objeto_contrato: publica ? n(f.objeto_contrato) : null,
        executora_id: executoraSemCadastro ? null : f.executora_id,
        executora_razao_social: executoraSemCadastro ? n(f.executora_razao_social) : null,
        executora_cnpj: executoraSemCadastro && f.executora_cnpj.trim() ? onlyDigits(f.executora_cnpj) : null,
        contratante_id: (contratanteSemCadastro || contratanteOrgaoId) ? null : n(f.contratante_id),
        orgao_contratante_id: contratanteOrgaoId,
        contratante_razao_social: contratanteSemCadastro ? n(f.contratante_razao_social) : null,
        contratante_cnpj: contratanteSemCadastro && !contratanteCpf && f.contratante_cnpj.trim() ? onlyDigits(f.contratante_cnpj) : null,
        contratante_cpf: contratanteSemCadastro && contratanteCpf ? onlyDigits(f.contratante_cnpj) : null,
        imovel_endereco: drenagem ? n(f.imovel_endereco) : null,
        processo_urbanismo: drenagem ? n(f.processo_urbanismo) : null,
        subcontratada_id: n(f.subcontratada_id), responsavel_tecnico_id: n(f.responsavel_tecnico_id),
        art_numero: n(f.art_numero), protocolo_data: f.protocolo_data, situacao: f.situacao,
        inicio_previsto: n(f.inicio_previsto),
        fim_previsto: n(f.fim_previsto),
        concluida_em: deferindo ? n(f.concluida_em) : null,
        recomposicao_data: deferindo && f.concluida_em ? n(f.recomposicao_data) : null,
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
          <Field label="Setor" required hint={f.setor === 'telecom'
            ? 'Segue a Resolução Conjunta nº 001/2026.' : 'Fora de telecom não se aplicam as regras da Resolução.'}>
            <select className={inputClass} required disabled={ro} value={f.setor}
                    onChange={(e) => {
                      const st = e.target.value as Setor;
                      set('setor', st);
                      // Empresa que não atua no novo setor sai da licença.
                      const fora = (id: string) => id && id !== SEM_CADASTRO
                        && !id.startsWith(ORGAO_PREFIXO) && !atuaNoSetor(porId.get(id)!, st);
                      if (fora(f.executora_id)) set('executora_id', '');
                      if (fora(f.subcontratada_id)) set('subcontratada_id', '');
                      // Contratante pode ser órgão público; confere pelo setor do órgão.
                      if (f.contratante_id.startsWith(ORGAO_PREFIXO)) {
                        const o = orgaos.find((x) => `${ORGAO_PREFIXO}${x.id}` === f.contratante_id);
                        if (!o || !orgaoNoSetor(o, st)) set('contratante_id', '');
                      } else if (fora(f.contratante_id)) set('contratante_id', '');
                    }}>
              {SETORES.map((st) => <option key={st} value={st}>{SETOR_LABEL[st]}</option>)}
            </select>
          </Field>
          <Field label="Nº do processo" required hint="SEI (NIT-050120/000000/2026) ou a numeração anterior.">
            <input className={`${inputClass} tabular`} required disabled={ro} value={f.processo_sei}
                   onChange={(e) => set('processo_sei', e.target.value)} />
          </Field>
          <Field label="Data do protocolo" required>
            <input type="date" className={inputClass} required disabled={ro} value={f.protocolo_data}
                   onChange={(e) => set('protocolo_data', e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Tipo de intervenção" required hint="A natureza do que será feito: uma obra ou um serviço.">
            <select className={inputClass} required disabled={ro} value={f.tipo_intervencao}
                    onChange={(e) => set('tipo_intervencao', e.target.value as TipoIntervencao)}>
              <option value="">Selecione</option>
              {TIPOS_INTERVENCAO.map((t) => <option key={t} value={t}>{TIPO_INTERVENCAO_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Origem da intervenção" required className="sm:col-span-2"
                 hint={publica ? 'Obra ou serviço público: o contratante é o órgão ou a autarquia, e a executora é a empresa contratada.'
                   : 'Concessionárias e prestadoras de serviço, com ou sem terceirizada.'}>
            <select className={inputClass} required disabled={ro} value={f.origem_intervencao}
                    onChange={(e) => trocarOrigem(e.target.value as OrigemIntervencao)}>
              {ORIGENS.map((o) => <option key={o} value={o}>{ORIGEM_LABEL[o]}</option>)}
            </select>
          </Field>
        </div>
        <fieldset className="mt-5">
          <legend className="text-[13px] font-medium text-tinta-700">
            Tipo de obra <span className="text-baixa" aria-hidden>*</span>
            <span className="ml-2 font-normal text-tinta-500">
              {f.setor === 'telecom' ? 'art. 10; ' : ''}marque todos que se aplicam
            </span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {tiposDoSetor.map((t) => (
              <label key={t.codigo} className="inline-flex items-center gap-2 text-sm text-tinta-800">
                <input type="checkbox" disabled={ro} checked={f.tipos_obra.includes(t.codigo as TipoObra)}
                       onChange={(e) => set('tipos_obra', e.target.checked
                         ? [...f.tipos_obra, t.codigo as TipoObra]
                         : f.tipos_obra.filter((x) => x !== t.codigo))} />
                {t.rotulo}
              </label>
            ))}
          </div>
          {f.tipos_obra.includes('outros') && (
            <Field label="Descreva o tipo (Outros)" required className="mt-4" hint="Aparece no registro e na placa do canteiro.">
              <input className={inputClass} required disabled={ro} value={f.outros_descricao}
                     onChange={(e) => set('outros_descricao', e.target.value)} />
            </Field>
          )}
        </fieldset>
        <Field label={f.tipo_intervencao === 'servico' ? 'Escopo do serviço' : f.tipo_intervencao === 'obra' ? 'Escopo da obra' : 'Escopo da obra ou serviço'} required className="mt-5" hint="O que será feito, como aparecerá na placa do canteiro (art. 14).">
          <textarea className={inputClass} rows={2} required disabled={ro} value={f.escopo}
                    onChange={(e) => set('escopo', e.target.value)} />
        </Field>
        {drenagem && (
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_260px]">
            <Field label="Endereço do imóvel atendido" required={!anterior} hint="Imóvel ligado à rede pública de drenagem.">
              <input className={inputClass} required={!anterior} disabled={ro} value={f.imovel_endereco}
                     onChange={(e) => set('imovel_endereco', e.target.value)} />
            </Field>
            <Field label="Processo da obra no Urbanismo" required={!anterior} hint="Licenciamento da edificação.">
              <input className={`${inputClass} tabular`} required={!anterior} disabled={ro} value={f.processo_urbanismo}
                     onChange={(e) => set('processo_urbanismo', e.target.value)} />
            </Field>
          </div>
        )}
      </Card>

      <Card title="Situação e período">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Situação" required>
            <select className={inputClass} disabled={ro}
                    value={uiSituacao} onChange={(e) => setUiSituacao(e.target.value as UiSituacao)}>
              {/* "Indeferida" só aparece em licença já indeferida (histórico), para o campo mostrar o valor gravado. */}
              {situacoesRegistraveis(Object.keys(UI_SITUACAO_LABEL) as UiSituacao[], licenca?.situacao ?? null)
                .map((s) => <option key={s} value={s}>{UI_SITUACAO_LABEL[s]}</option>)}
            </select>
          </Field>
          {deferindo && (
            <Field label="Nº da licença" required hint="Numeração própria da SECONSER.">
              <input className={inputClass} required disabled={ro} value={f.numero} onChange={(e) => set('numero', e.target.value)} />
            </Field>
          )}
        </div>
        {deferindo && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Início da obra ou serviço" required hint="A validade de 30 dias conta a partir do início.">
              <input type="date" className={inputClass} required disabled={ro} value={f.inicio_previsto}
                     onChange={(e) => set('inicio_previsto', e.target.value)} />
            </Field>
            <Field label="Fim da obra ou serviço" required hint="Previsão de término. A validade da licença é outra: veja o cartão de validade.">
              <input type="date" className={inputClass} required disabled={ro} value={f.fim_previsto}
                     min={f.inicio_previsto || undefined} onChange={(e) => set('fim_previsto', e.target.value)} />
            </Field>
          </div>
        )}
        {f.setor === 'telecom' && anterior && (
          <p className="mt-4 rounded-sm border-l-4 border-tinta-300 bg-tinta-50 px-3 py-2 text-sm text-tinta-700">
            Protocolo anterior a 09/09/2026: registro histórico, anterior à Resolução. Não exige empresa APTA nem ART,
            e aceita executora e contratante sem cadastro no CADEX.
          </p>
        )}
        {f.setor !== 'telecom' && (
          <p className="mt-4 rounded-sm border-l-4 border-tinta-300 bg-tinta-50 px-3 py-2 text-sm text-tinta-700">
            {SETOR_LABEL[f.setor]}: a Resolução nº 001/2026 vale só para telecomunicações. Não se exige empresa APTA,
            ART da obra nem vínculo da subcontratada.
            {anterior && ' Protocolo anterior a 09/09/2026: aceita executora sem cadastro no CADEX.'}
          </p>
        )}
        {licenca?.situacao === 'deferida' && (
          <p className="mt-4 text-sm text-tinta-500">Licença deferida só pode ser cancelada.</p>
        )}
      </Card>

      <Card title="Empresas">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contratante" required={contratanteObrigatoria}
                 hint={publica ? (orgaosDoSetor.length === 0
                     ? 'Nenhum órgão cadastrado serve a esta origem neste setor. Cadastre em Órgãos públicos, informando a natureza (administração direta ou autarquia).'
                     : 'Órgão ou autarquia que contratou a empresa executora.')
                   : executoraTerceirizada ? 'Empresa titular (operadora, concessionária, construtora) ou órgão público que contratou a terceirizada.'
                   : drenagem ? 'Construtora ou o dono do imóvel (sem cadastro). Em branco só quando a própria construtora executa.'
                   : 'Empresa titular ou órgão público que contratou a obra ou o serviço. Se a própria titular executa, marque a opção ao lado.'}>
            <select className={inputClass} disabled={ro} required={contratanteObrigatoria}
                    value={f.contratante_id} onChange={(e) => trocarContratante(e.target.value)}>
              <option value="">{publica ? 'Selecione' : 'Nenhuma'}</option>
              {contratantes.length > 0 && (
                <optgroup label="Empresas">
                  {contratantes.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
                </optgroup>
              )}
              {orgaosDoSetor.length > 0 && (
                <optgroup label="Órgãos públicos">
                  {orgaosDoSetor.map((o) => (
                    <option key={o.id} value={`${ORGAO_PREFIXO}${o.id}`}>{nomeOrgao(o)}</option>
                  ))}
                </optgroup>
              )}
              {!publica && (anterior || drenagem || contratanteSemCadastro) && (
                <option value={SEM_CADASTRO}>{drenagem && !anterior ? 'Dono do imóvel ou empresa sem cadastro' : 'Empresa sem cadastro no CADEX'}</option>
              )}
            </select>
          </Field>
          {!publica && <div className="sm:pt-6">
            <label className={`flex items-start gap-2 text-sm ${podeAutoExecutar && !ro ? 'text-tinta-800' : 'text-tinta-500'}`}>
              <input type="checkbox" className="mt-0.5" disabled={ro || !podeAutoExecutar} checked={mesmaEmpresa}
                     onChange={(e) => marcarAutoExecucao(e.target.checked)} />
              <span>
                A própria contratante executará a obra ou serviço.
                {!podeAutoExecutar && (
                  <span className="mt-0.5 block text-xs text-tinta-500">
                    {!contratanteEmpresaId
                      ? 'Escolha a contratante entre as empresas cadastradas.'
                      : !podeExecutar ? 'Esta empresa não está habilitada a executar neste setor.'
                      : 'O cadastro desta empresa não marca que ela executa obras ou serviços por conta própria.'}
                    {contratanteEmpresaId && podeExecutar && !cadastroHabilita && (
                      <> <Link className="underline" to={`/empresas/${contratanteEmpresaId}`}>Abrir o cadastro</Link></>
                    )}
                  </span>
                )}
              </span>
            </label>
          </div>}
          {contratanteSemCadastro && (
            <SemCadastro quem="contratante" ro={ro} razao={f.contratante_razao_social} cnpj={f.contratante_cnpj}
                         donoImovel={drenagem}
                         onRazao={(v) => set('contratante_razao_social', v)} onCnpj={(v) => set('contratante_cnpj', v)} />
          )}
          <Field label="Executora" required
                 hint={mesmaEmpresa ? 'Mesma pessoa jurídica da contratante: um só cadastro.' : undefined}>
            <select className={inputClass} required disabled={ro || mesmaEmpresa} value={f.executora_id}
                    onChange={(e) => { set('executora_id', e.target.value); limparPartesDaExecutora(); }}>
              <option value="">Selecione</option>
              {executorasLista.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
              {(anterior || executoraSemCadastro) && <option value={SEM_CADASTRO}>Empresa sem cadastro no CADEX</option>}
            </select>
          </Field>
          {executoraSemCadastro && (
            <SemCadastro quem="executora" ro={ro} razao={f.executora_razao_social} cnpj={f.executora_cnpj}
                         onRazao={(v) => set('executora_razao_social', v)} onCnpj={(v) => set('executora_cnpj', v)} />
          )}
          <Field label="Subcontratada" hint={!resolucao ? undefined : f.executora_id && subcontratadas.length === 0
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
        </div>
        {([f.executora_id, f.contratante_id, f.subcontratada_id].some((i) => i && i !== SEM_CADASTRO && !i.startsWith(ORGAO_PREFIXO))
          || contratanteOrgaoId) && (
          <ul className="mt-4 space-y-1 text-sm">
            {([[mesmaEmpresa ? 'Contratante e executora' : 'Contratante', f.contratante_id],
               ...(mesmaEmpresa ? [] : [['Executora', f.executora_id]]),
               ['Subcontratada', f.subcontratada_id]] as const)
              .filter(([, i]) => i && i !== SEM_CADASTRO && !i.startsWith(ORGAO_PREFIXO))
              .map(([r, i]) => {
                const e = porId.get(i)!;
                return (
                  <li key={r} className="flex flex-wrap items-center gap-2 text-tinta-700">
                    <span className="w-44 text-tinta-500">{r}</span>
                    <SituacaoBadge s={situacaoEfetiva(e, hoje)} />
                    <Link to={`/empresas/${e.id}`} className="hover:underline">{nomeEmpresa(e)}</Link>
                  </li>
                );
              })}
            {contratanteOrgaoId && (() => {
              const o = orgaos.find((x) => x.id === contratanteOrgaoId);
              return o ? (
                <li className="flex flex-wrap items-center gap-2 text-tinta-700">
                  <span className="w-44 text-tinta-500">Contratante</span>
                  <Badge>Órgão público</Badge>
                  <span>{nomeOrgao(o)}</span>
                </li>
              ) : null;
            })()}
          </ul>
        )}
      </Card>

      {publica && (
        <Card title="Contrato público">
          <p className="mb-4 text-sm text-tinta-500">
            Dados do contrato administrativo, para fiscalização. Todos opcionais e restritos a quem trabalha no CADEX:
            não aparecem na consulta pública.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nº do contrato">
              <input className={`${inputClass} tabular`} disabled={ro} value={f.contrato_numero}
                     onChange={(e) => set('contrato_numero', e.target.value)} />
            </Field>
            <Field label="Processo administrativo">
              <input className={`${inputClass} tabular`} disabled={ro} value={f.processo_administrativo}
                     onChange={(e) => set('processo_administrativo', e.target.value)} />
            </Field>
            <Field label="Ordem de serviço">
              <input className={`${inputClass} tabular`} disabled={ro} value={f.ordem_servico_numero}
                     onChange={(e) => set('ordem_servico_numero', e.target.value)} />
            </Field>
          </div>
          <Field label="Objeto do contrato" className="mt-4" hint="Resumo do que foi contratado.">
            <textarea className={inputClass} rows={2} disabled={ro} value={f.objeto_contrato}
                      onChange={(e) => set('objeto_contrato', e.target.value)} />
          </Field>
        </Card>
      )}

      <Card title={`Trechos (${trechos.length})`}
            action={!ro && <Button variant="secondary" className="px-3! py-1.5!"
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
                <Field label="CEP" className="sm:col-span-1" hint="Preenche o endereço.">
                  <input className={`${inputClass} tabular`} disabled={ro} value={t.cep} inputMode="numeric"
                         placeholder="00000-000"
                         onChange={(e) => setTrecho(i, 'cep', formatCep(e.target.value))}
                         onBlur={(e) => void buscarCepTrecho(i, e.target.value)} />
                </Field>
                <Field label={trechos.length > 1 ? `Logradouro do trecho ${i + 1}` : 'Logradouro'} required className="sm:col-span-2">
                  <input className={inputClass} disabled={ro} value={t.logradouro}
                         onChange={(e) => setTrecho(i, 'logradouro', e.target.value)} />
                </Field>
                <Field label="Bairro" className="sm:col-span-2">
                  <input className={inputClass} disabled={ro} value={t.bairro} onChange={(e) => setTrecho(i, 'bairro', e.target.value)} />
                </Field>
                <div className="flex items-end sm:col-span-1">
                  {!ro && trechos.length > 1 && (
                    <Button variant="danger" className="w-full px-3!"
                            onClick={() => { setTrechos((ts) => ts.filter((_, j) => j !== i)); setSalvo(false); }}>
                      Remover
                    </Button>
                  )}
                </div>
                <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-6" disabled={ro}>
                  <legend className="mb-1 text-sm font-medium text-tinta-800">Tipo de trecho</legend>
                  {(Object.keys(ROTULO_TIPO_TRECHO) as TipoTrechoForm[]).map((tipo) => (
                    <label key={tipo} className="inline-flex items-center gap-2 text-sm text-tinta-800">
                      <input type="radio" name={`tipo-trecho-${i}`} value={tipo} checked={t.tipo === tipo}
                             onChange={() => setTipoTrecho(i, tipo)} className="accent-marca-600" />
                      {ROTULO_TIPO_TRECHO[tipo]}
                    </label>
                  ))}
                  <span className="text-sm text-tinta-500">
                    {t.tipo === 'ponto' && 'Um ponto, como a implantação de um poste.'}
                    {t.tipo === 'segmento' && 'Uma linha entre início e fim, como um trecho de rede.'}
                    {t.tipo === 'area' && 'Um polígono, como a área de uma obra ou canteiro.'}
                  </span>
                </fieldset>
                {t.tipo !== 'area' && (
                  <CoordField label={t.tipo === 'segmento' ? 'Início' : 'Ponto'} required valor={t.inicio} lida={ini} ro={ro}
                              onChange={(v) => setTrecho(i, 'inicio', v)} />
                )}
                {t.tipo === 'segmento' && (
                  <CoordField label="Fim" required valor={t.fim} lida={fim} ro={ro} onChange={(v) => setTrecho(i, 'fim', v)} />
                )}
                {(!ro || t.area || t.inicio) && (
                  <div className="flex flex-col gap-3 sm:col-span-6">
                    <div>
                      <Button variant="secondary" className="px-3! py-1.5!"
                              onClick={() => setAreaAberta(areaAberta === i ? null : i)}>
                        {areaAberta === i ? 'Ocultar o mapa' : 'Marcar no mapa'}
                      </Button>
                      <span className="ml-3 text-sm text-tinta-500">
                        {t.tipo === 'area' ? 'Marque os cantos da área.' : t.tipo === 'segmento' ? 'Marque o início e o fim.' : 'Marque o ponto.'}
                      </span>
                    </div>
                    {areaAberta === i && (
                      <Suspense fallback={<div className="h-[360px] rounded-sm border border-tinta-200 bg-tinta-50" />}>
                        <DesenhoArea tipo={t.tipo}
                                     inicio={lerCoordenada(t.inicio) ? [lerCoordenada(t.inicio)!.lng, lerCoordenada(t.inicio)!.lat] : null}
                                     fim={lerCoordenada(t.fim) ? [lerCoordenada(t.fim)!.lng, lerCoordenada(t.fim)!.lat] : null}
                                     area={t.area} ro={ro} onChange={(p) => marcarNoMapa(i, p)} />
                      </Suspense>
                    )}
                  </div>
                )}
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

      {uiSituacao === 'concluida' && (
        <Card title="Conclusão da obra">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Concluída em" required>
              <input type="date" className={inputClass} required disabled={ro} value={f.concluida_em}
                     min={f.inicio_previsto || undefined} onChange={(e) => set('concluida_em', e.target.value)} />
            </Field>
            {f.concluida_em && (<>
              <Field label="Pavimento recomposto em" hint="Quando a via foi reposta; a garantia da recomposição corre a partir daqui.">
                <input type="date" className={inputClass} disabled={ro} value={f.recomposicao_data}
                       min={f.concluida_em || undefined} onChange={(e) => set('recomposicao_data', e.target.value)} />
              </Field>
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
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-tinta-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
          <div className="mr-auto min-w-0"><ErrorNote error={error} /></div>
          {salvo && <span className="text-sm text-alta" role="status">Licença salva.</span>}
          <Link to={licenca ? `/obras/${licenca.id}` : '/obras'} className="text-sm font-semibold text-tinta-600 hover:underline">Cancelar</Link>
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
      <input className={`${inputClass} tabular ${valor.trim() && !lida ? 'border-baixa!' : ''}`} disabled={ro}
             value={valor} placeholder="-22.895000, -43.123000" onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/**
 * Aviso de coordenação (nunca bloqueia): outras obras a até 15 m, no mesmo
 * período (vigente) ou ainda na garantia da recomposição. Inspirado no
 * Street Manager/811 — evitar abrir a mesma via duas vezes.
 */
function Conflitos({ licencaId }: { licencaId: string }) {
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  useEffect(() => { buscarConflitos(licencaId).then(setConflitos).catch(() => setConflitos([])); }, [licencaId]);
  if (conflitos.length === 0) return null;
  return (
    <section className="mb-8 rounded-sm border-l-4 border-atencao bg-atencao/6 px-4 py-3" role="status">
      <h2 className="text-sm font-semibold text-tinta-900">
        Atenção: {conflitos.length} obra{conflitos.length > 1 ? 's' : ''} próxima{conflitos.length > 1 ? 's' : ''} (até 15 m)
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm text-tinta-700">
        {conflitos.map((c) => (
          <li key={c.licenca_id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Badge tom={c.tipo === 'recomposicao' ? 'ruim' : 'alerta'}>
              {c.tipo === 'recomposicao' ? 'Via recém-recomposta' : 'Obra vigente'}
            </Badge>
            <Link to={`/obras/${c.licenca_id}`} className="font-medium hover:text-marca-700 hover:underline">
              {c.numero ? `Licença ${c.numero}` : c.processo_sei}
            </Link>
            <span className="text-tinta-500">
              {c.logradouro ? `${c.logradouro} · ` : ''}~{c.distancia_m} m
              {c.executora ? ` · ${c.executora}` : ''}
              {c.ate ? (c.tipo === 'recomposicao' ? ` · garantia até ${dataBR(c.ate)}` : ` · até ${dataBR(c.ate)}`) : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-tinta-500">
        Aviso de coordenação — não impede o deferimento. Confira se a intervenção se justifica no mesmo local e período.
      </p>
    </section>
  );
}

/** QR Code da placa do canteiro (art. 14) e atalho para imprimir. */
/** Validade da licença: 30 dias a partir do início, prorrogável. Órgão público é registro, sem prazo. */
function Validade({ licenca, hoje, onProrrogada }: { licenca: LicencaComTrechos; hoje: string; onProrrogada: () => Promise<void> }) {
  const [nova, setNova] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const semPrazo = !!licenca.orgao_contratante_id;
  const vencida = !!licenca.validade_ate && hoje > licenca.validade_ate;
  const prorrogar = async () => {
    setBusy(true);
    setErro(null);
    try {
      await prorrogarLicenca(licenca.id, nova);
      setNova('');
      await onProrrogada();
    } catch (e) {
      setErro(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="cartao mb-10 p-5" aria-label="Validade da licença">
      <h2 className="font-display text-base font-bold text-tinta-900">Validade</h2>
      {semPrazo ? (
        <p className="mt-2 text-sm text-tinta-700">Licença vinculada a órgão público: registro para controle, sem prazo de validade.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-tinta-700">
            {licenca.validade_ate
              ? <>Válida até <strong>{dataBR(licenca.validade_ate)}</strong>{vencida ? ' (vencida)' : ''}. A licença vale 30 dias a partir do início, salvo prorrogação.</>
              : 'Sem validade registrada. Informe o início da obra ou serviço e salve para calcular.'}
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="Nova validade">
              <input type="date" className={inputClass} value={nova} min={licenca.validade_ate ?? hoje}
                     onChange={(e) => setNova(e.target.value)} />
            </Field>
            <Button type="button" variant="secondary" disabled={!nova || busy} onClick={() => void prorrogar()}>
              {busy ? 'Prorrogando…' : 'Prorrogar validade'}
            </Button>
          </div>
          <div className="mt-2"><ErrorNote error={erro} /></div>
        </>
      )}
    </section>
  );
}

function Placa({ licenca }: { licenca: LicencaComTrechos }) {
  const url = urlPublicaLicenca(licenca.codigo_publico);
  const [copiado, setCopiado] = useState(false);
  return (
    <section className="cartao mb-10 flex flex-wrap items-center gap-6 p-5">
      <QrCode texto={url} tamanho={120} />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-bold tracking-[-0.015em] text-tinta-900">Placa do canteiro</h2>
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
function SemCadastro({ quem, ro, razao, cnpj, donoImovel, onRazao, onCnpj }: {
  quem: 'executora' | 'contratante'; ro: boolean; razao: string; cnpj: string; donoImovel?: boolean;
  onRazao: (v: string) => void; onCnpj: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 rounded-sm border border-dashed border-tinta-300 p-4 sm:col-span-2 sm:grid-cols-[1fr_220px]">
      {donoImovel ? (
        <Field label="Nome ou razão social do dono do imóvel" required
               hint="Pessoa física (CPF): o nome não aparece nas páginas públicas.">
          <input className={inputClass} required disabled={ro} value={razao} onChange={(e) => onRazao(e.target.value)} />
        </Field>
      ) : (
        <Field label={`Razão social da ${quem}`} required hint="Não entra no cadastro nem na consulta pública de empresas.">
          <input className={inputClass} required disabled={ro} value={razao} onChange={(e) => onRazao(e.target.value)} />
        </Field>
      )}
      <Field label={donoImovel ? 'CPF ou CNPJ' : 'CNPJ'} required={donoImovel} hint={donoImovel ? undefined : 'Se constar no processo.'}>
        <input className={`${inputClass} tabular`} disabled={ro} value={cnpj} inputMode="numeric" required={donoImovel}
               onChange={(e) => onCnpj(donoImovel && onlyDigits(e.target.value).length <= 11
                 ? formatCpf(e.target.value) : formatCnpj(e.target.value))} />
      </Field>
    </div>
  );
}
