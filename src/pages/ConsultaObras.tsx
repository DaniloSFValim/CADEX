import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AbasConsulta } from '../components/AbasConsulta';
import ObrasPorMes from '../components/ObrasPorMes';
import HistoricoAcervo from '../components/HistoricoAcervo';
import FichaObra from '../components/FichaObra';
import { Cabecalho } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { Empty, ErrorNote, Kpi, Spinner, Titulo, linkTexto } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { hojeISO } from '../lib/empresas';
import { ORIGEM_LABEL, TIPO_INTERVENCAO_LABEL, origemPublica } from '../lib/licencas';
import { carregarBairrosGeo, chaveBairro, type BairroGeo } from '../lib/bairros';
import { listarTipos, mapaRotulosTipos, rotuloDoTipo } from '../lib/tiposIntervencao';
import {
  COR_SITUACAO, SITUACAO_PUBLICA_LABEL, anosDasObras, baixarObrasGeojson, buscarObrasPublicas, filtrarPainel, nomeLimpo, obrasProximas,
  obraNoAno, obraNoMes, resumoPor, temLocalizacao, textoDistancia, type FiltroPainel, type ObraPublica, type ResumoNome,
} from '../lib/obras';

// O mapa (MapLibre) é pesado: só carrega nesta página.
const MapaObras = lazy(() => import('../components/MapaObras'));

/** Consulta pública: obras licenciadas pela SECONSER, no mapa e em lista. */
export default function ConsultaObras() {
  const [obras, setObras] = useState<ObraPublica[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [modo, setModo] = useState<'pontos' | 'calor'>('pontos');
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false);
  const [bairro, setBairro] = useState<string | null>(null);
  const [situacaoLista, setSituacaoLista] = useState<ObraPublica['situacao'] | ''>('');
  const [regiao, setRegiao] = useState('');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<'bairro' | 'inicio' | 'empresa' | 'situacao'>('bairro');
  const [periodoIni, setPeriodoIni] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const listaRef = useRef<HTMLDivElement>(null);
  // No celular, os filtros ficam recolhidos para o mapa aparecer primeiro.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // Linha do tempo: null = todas as datas; senão, o ano escolhido e, opcionalmente, o mês.
  const anoAtual = new Date().getFullYear();
  const [tempo, setTempo] = useState<{ ano: number; mes: number | null } | null>(null);
  const mesTempo = tempo?.mes ?? null;
  const anoTempo = tempo?.ano ?? anoAtual;
  const [reproduzindo, setReproduzindo] = useState(false);
  // A navegação vai do primeiro ao último ano com obras (e sempre inclui o ano atual).
  const anosComObras = useMemo(() => anosDasObras(obras ?? []).map(Number), [obras]);
  const anoMin = Math.min(anoAtual, ...anosComObras);
  const anoMax = Math.max(anoAtual, ...anosComObras);
  // Reprodução: avança mês a mês e, ao fim do ano, passa para janeiro do ano seguinte, até o último ano com obras.
  useEffect(() => {
    if (!reproduzindo) return;
    const t = window.setInterval(() => {
      setTempo((atual) => {
        const ano = atual?.ano ?? anoAtual;
        const mes = atual?.mes ?? null;
        if (mes === null) return { ano, mes: 0 };
        if (mes < 11) return { ano, mes: mes + 1 };
        if (ano < anoMax) return { ano: ano + 1, mes: 0 };
        return atual;
      });
    }, 1100);
    return () => window.clearInterval(t);
  }, [reproduzindo, anoAtual, anoMax]);
  // Para ao chegar ao último mês com obras.
  useEffect(() => {
    if (reproduzindo && tempo?.mes === 11 && tempo.ano >= anoMax) setReproduzindo(false);
  }, [reproduzindo, tempo, anoMax]);
  // Bairros oficiais por chave: nome canônico e região. Vazio até carregar.
  const [bairrosGeo, setBairrosGeo] = useState<Map<string, BairroGeo>>(new Map());
  const [baixando, setBaixando] = useState(false);
  const [filtro, setFiltro] = useState<FiltroPainel>({ situacao: null, executora: null });
  const mapaRef = useRef<HTMLDivElement>(null);
  const filtroAtivo = filtro.executora !== null;

  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  useEffect(() => { buscarObrasPublicas().then(setObras).catch(setError); }, []);
  useEffect(() => {
    carregarBairrosGeo()
      .then((g) => setBairrosGeo(new Map((g.features as { properties: BairroGeo }[]).map((f) => [chaveBairro(f.properties.nome), f.properties]))))
      .catch(() => setBairrosGeo(new Map()));
  }, []);
  useEffect(() => { listarTipos().then((t) => setRotulos(mapaRotulosTipos(t))).catch(() => setRotulos({})); }, []);

  /** Seleciona a obra e leva a tela ao mapa, sem voltar ao cabeçalho: a ficha abre sobre o mapa. */
  function verNoMapa(codigo: string) {
    setFoco(codigo);
    mapaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function baixarGeojson() {
    setError(null);
    setBaixando(true);
    try { await baixarObrasGeojson(); }
    catch (e) { setError(e); }
    finally { setBaixando(false); }
  }

  const todas = useMemo(() => obras ?? [], [obras]);
  const ativas = useMemo(() => todas.filter(obraAtiva), [todas]);
  const bairroDaObra = (o: ObraPublica) => o.trechos[0]?.bairro?.trim() || '';
  const porBairro = bairro ? (o: ObraPublica) => chaveBairro(bairroDaObra(o) || 'Sem bairro') === chaveBairro(bairro) : () => true;
  const porRegiao = regiao ? (o: ObraPublica) => bairrosGeo.get(chaveBairro(bairroDaObra(o)))?.regiao === regiao : () => true;
  const regioes = useMemo(() => [...new Set([...bairrosGeo.values()].map((b) => b.regiao))].sort(), [bairrosGeo]);
  const obrasPainel = useMemo(() => filtrarPainel(obras ?? [], filtro), [obras, filtro]);
  // Escolher uma situação específica olha todas as obras (inclusive concluídas e prazos encerrados).
  // Com período escolhido, as obras encerradas também entram: o histórico precisa aparecer na consulta por data.
  const base = filtroAtivo ? obrasPainel : mostrarEncerradas || situacaoLista || tempo ? todas : ativas;
  const termo = busca.trim().toLowerCase();
  const porBusca = (o: ObraPublica) => !termo || [o.numero, o.executora, o.contratante ?? '', o.escopo,
    ...o.trechos.flatMap((t) => [t.logradouro, t.bairro ?? ''])].some((s) => s.toLowerCase().includes(termo));
  // Período: a obra entra se o seu intervalo previsto toca o intervalo escolhido. Sem datas, não entra.
  const porPeriodo = (o: ObraPublica) => {
    if (!periodoIni && !periodoFim) return true;
    if (!o.inicio_previsto && !o.fim_previsto) return false;
    const ini = o.inicio_previsto ?? o.fim_previsto ?? '';
    const fim = o.fim_previsto ?? o.inicio_previsto ?? '';
    return (!periodoIni || fim >= periodoIni) && (!periodoFim || ini <= periodoFim);
  };
  // Linha do tempo: com ano ou mês escolhido, mapa e lista mostram só as obras desse período.
  const porTempo = (o: ObraPublica) => !tempo || (tempo.mes === null ? obraNoAno(o, tempo.ano) : obraNoMes(o, tempo.ano, tempo.mes));
  const listadas = base.filter((o) => !situacaoLista || o.situacao === situacaoLista)
    .filter(porRegiao).filter(porBairro).filter(porBusca).filter(porPeriodo).filter(porTempo);
  const grupos = useMemo(() => (ordem === 'bairro'
    ? agruparPorBairro(listadas, bairrosGeo)
    : [{ bairro: ROTULO_ORDEM[ordem], obras: ordenarObras(listadas, ordem) }]), [listadas, bairrosGeo, ordem]);
  const executoras = useMemo(() => resumoPor(todas, (o) => o.executora), [todas]);
  const contratantes = useMemo(() => resumoPor(todas, (o) => o.contratante), [todas]);
  const stats = useMemo(() => resumo(todas), [todas]);
  const selecionada = useMemo(() => (obras ?? []).find((o) => o.codigo === foco) ?? null, [obras, foco]);
  // Mapa → lista: a obra escolhida no mapa aparece na lista.
  useEffect(() => {
    if (foco) document.getElementById(`obra-${foco}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [foco]);

  return (
    <div className="flex min-h-screen flex-col bg-tinta-50">
      <Cabecalho />

      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <Titulo
          trilha="Consulta pública"
          titulo="Obras licenciadas em Niterói"
          descricao="Veja no mapa as obras licenciadas nas vias da cidade: quem executa, onde e até quando."
        />

        {obras && (
          <div className="mt-8 grid grid-cols-3 gap-x-8 gap-y-6">
            {/* Indicadores clicáveis: Vigentes aplica o filtro; Bairros e Executoras levam à seção correspondente. */}
            <button type="button" aria-pressed={!mostrarEncerradas && !situacaoLista}
                    onClick={() => { setMostrarEncerradas(false); setSituacaoLista(''); listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="rounded-xl text-left transition-colors hover:bg-tinta-100/60 focus-visible:outline-2 focus-visible:outline-marca-700">
              <Kpi rotulo="Vigentes agora" valor={stats.vigentes} detalhe="clique para ver só as vigentes" tom="alta" />
            </button>
            <button type="button" onClick={() => listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="rounded-xl text-left transition-colors hover:bg-tinta-100/60 focus-visible:outline-2 focus-visible:outline-marca-700">
              <Kpi rotulo={stats.bairros === 1 ? 'Bairro' : 'Bairros'} valor={stats.bairros} detalhe="clique para ver a lista" />
            </button>
            <button type="button" onClick={() => document.getElementById('exec-titulo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="rounded-xl text-left transition-colors hover:bg-tinta-100/60 focus-visible:outline-2 focus-visible:outline-marca-700">
              <Kpi rotulo={stats.execs === 1 ? 'Executora' : 'Executoras'} valor={stats.execs} detalhe="clique para ver as executoras" />
            </button>
          </div>
        )}

        <AbasConsulta />

        {/* Filtros numa superfície clara, logo abaixo das abas. */}
        <p className="mt-5 text-sm text-tinta-600">
          Para ver uma licença, escolha uma obra no mapa ou na lista e abra <strong className="font-semibold text-tinta-800">Ver licença</strong>.
          Lá estão o trecho, a executora e o prazo.
        </p>
        <ErrorNote error={error} />
        {!obras && !error && <Spinner label="Carregando as obras…" />}

        {obras && (
          <div className="mt-6 flex flex-col gap-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:items-start">
              <div className="min-w-0">
            {/* Mapa em largura total; a ficha da obra selecionada fica sobre ele. */}
            <div>
              <Suspense fallback={<div className="h-[60vh] min-h-[360px] rounded-xl border border-tinta-200 bg-tinta-50" />}>
                <details className="group mb-2 rounded-xl border border-tinta-200 bg-white px-4 py-2 text-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-tinta-900 [&::-webkit-details-marker]:hidden">
                    Linha do tempo
                    <span className="text-xs font-normal text-tinta-600">
                      {tempo === null ? 'Todas as datas' : mesTempo === null ? `Obras de ${anoTempo}` : `${NOMES_MESES[mesTempo]} de ${anoTempo}`}
                    </span>
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-tinta-700">Ano</span>
                      <button type="button" disabled={anoTempo <= anoMin} aria-label="Ano anterior"
                              onClick={() => { setReproduzindo(false); setTempo((t) => ({ ano: Math.max(anoMin, (t?.ano ?? anoAtual) - 1), mes: t?.mes ?? null })); }}
                              className="rounded-full border border-tinta-200 bg-white px-3 py-1.5 text-xs font-semibold text-tinta-800 hover:bg-tinta-50 disabled:cursor-not-allowed disabled:opacity-40">‹ Ano anterior</button>
                      <span className="tabular min-w-[4rem] text-center text-base font-semibold text-tinta-900">{anoTempo}</span>
                      <button type="button" disabled={anoTempo >= anoMax} aria-label="Próximo ano"
                              onClick={() => { setReproduzindo(false); setTempo((t) => ({ ano: Math.min(anoMax, (t?.ano ?? anoAtual) + 1), mes: t?.mes ?? null })); }}
                              className="rounded-full border border-tinta-200 bg-white px-3 py-1.5 text-xs font-semibold text-tinta-800 hover:bg-tinta-50 disabled:cursor-not-allowed disabled:opacity-40">Próximo ano ›</button>
                      <button type="button" disabled={tempo === null}
                              onClick={() => { setReproduzindo(false); setTempo(null); }}
                              className="rounded-full border border-tinta-200 bg-white px-3 py-1.5 text-xs font-semibold text-tinta-800 hover:bg-tinta-50 disabled:cursor-not-allowed disabled:opacity-40">Ver todas as datas</button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex min-w-0 flex-1 items-center gap-3 text-tinta-700">
                        <span className="text-xs font-semibold text-tinta-700">Mês</span>
                        <input type="range" min={0} max={11} step={1} value={mesTempo ?? 0} aria-label="Mês do mapa"
                               onChange={(e) => setTempo({ ano: anoTempo, mes: Number(e.target.value) })}
                               className="w-full min-w-[12rem] accent-marca-700" aria-valuetext={NOMES_MESES[mesTempo ?? 0]} />
                      </label>
                      <span className="tabular text-xs text-tinta-600">
                        {tempo === null
                          ? 'Sem filtro de data'
                          : `${listadas.length} obra${listadas.length === 1 ? '' : 's'} com período em ${mesTempo === null ? '' : NOMES_MESES[mesTempo] + ' de '}${anoTempo}`}
                      </span>
                      <button type="button" aria-pressed={reproduzindo}
                              onClick={() => {
                                if (!reproduzindo && (tempo === null || (tempo.mes === 11 && tempo.ano >= anoMax))) setTempo({ ano: anoTempo, mes: 0 });
                                setReproduzindo((r) => !r);
                              }}
                              className="rounded-full border border-tinta-200 bg-white px-3 py-1.5 text-xs font-semibold text-tinta-800 hover:bg-tinta-50 disabled:cursor-not-allowed disabled:opacity-40">
                        {reproduzindo ? 'Pausar' : 'Reproduzir'}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-tinta-500">
                    Mapa e lista mostram as mesmas obras: as que têm período previsto no ano ou mês escolhido.
                  </p>
                </details>
                <details className="group mb-2 flex justify-end text-xs text-tinta-600">
                  <summary className="cursor-pointer list-none rounded-full px-3 py-1 font-semibold text-tinta-700 hover:text-tinta-900 [&::-webkit-details-marker]:hidden">
                    Opções do mapa
                  </summary>
                  <div className="mt-2 flex flex-col items-end gap-2">
                    <div role="group" aria-label="Visualização do mapa" className="inline-flex rounded-full border border-tinta-200 bg-white p-0.5 text-xs font-semibold">
                      {(['pontos', 'calor'] as const).map((m) => (
                        <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}
                                className={`rounded-full px-3 py-1 ${modo === m ? 'bg-marca-700 text-white' : 'text-tinta-600 hover:text-tinta-900'}`}>
                          {m === 'pontos' ? 'Obras' : 'Mapa de calor'}
                        </button>
                      ))}
                    </div>
                    <p>
                      <button type="button" className={linkTexto} disabled={baixando} onClick={() => void baixarGeojson()}>
                        {baixando ? 'Preparando…' : 'Dados abertos: baixar GeoJSON'}
                      </button>
                      <span className="text-tinta-400">. Todas as obras licenciadas, para uso livre.</span>
                    </p>
                  </div>
                </details>
                <div ref={mapaRef} className="relative scroll-mt-4 overflow-hidden rounded-xl border border-tinta-200 shadow-xs">
                  <MapaObras obras={listadas}
                             foco={foco} destaque={destaque} modo={modo} bairro={bairro}
                             onSelecionar={setFoco} onBairro={setBairro} onDestacar={setDestaque} />
                  {selecionada && <FichaObra obra={selecionada} onFechar={() => setFoco(null)} />}
                </div>
              </Suspense>
              <Legenda />
              <p className="mt-2 text-xs leading-relaxed text-tinta-500">
                Cada trecho aparece como uma linha reta entre o início e o fim informados na licença, sem seguir o
                traçado da rua. Para o percurso exato, abra a licença.
              </p>
            </div>

              </div>
              <div ref={listaRef} className="min-w-0 lg:sticky lg:top-4 lg:max-h-[85vh] lg:overflow-y-auto lg:pr-1">
            {/* Lista das obras, agrupada por bairro. Por padrão, só as vigentes ou aguardando início. */}
            <section aria-live="polite" aria-label="Lista das obras e serviços licenciados">
              <button type="button" aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos((v) => !v)}
                      className="mb-3 flex w-full items-center justify-between rounded-xl border border-tinta-200 bg-white px-4 py-2.5 text-sm font-semibold text-tinta-900 lg:hidden">
                Filtros e ordenação
                <span aria-hidden>{filtrosAbertos ? 'Fechar' : 'Abrir'}</span>
              </button>
              <div className={`mb-3 ${filtrosAbertos ? 'flex' : 'hidden'} flex-wrap items-center justify-between gap-3 lg:flex`}>
                <div role="group" aria-label="Quais obras mostrar" className="inline-flex rounded-full border border-tinta-200 bg-white p-0.5 text-sm font-semibold">
                  {([false, true] as const).map((todasAsObras) => (
                    <button key={String(todasAsObras)} type="button" aria-pressed={mostrarEncerradas === todasAsObras}
                            onClick={() => setMostrarEncerradas(todasAsObras)}
                            className={`rounded-full px-4 py-1.5 ${mostrarEncerradas === todasAsObras ? 'bg-marca-700 text-white' : 'text-tinta-600 hover:text-tinta-900'}`}>
                      {todasAsObras ? `Todas (${todas.length})` : `Vigentes (${ativas.length})`}
                    </button>
                  ))}
                </div>
                {regioes.length > 0 && (
                  <label className="flex items-center gap-2 text-sm text-tinta-700">
                    <span className="font-semibold">Região</span>
                    <select value={regiao} onChange={(e) => setRegiao(e.target.value)}
                            className="rounded-full border border-tinta-200 bg-white px-3 py-1.5 text-sm text-tinta-900">
                      <option value="">Todas</option>
                      {regioes.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm text-tinta-700">
                  <span className="font-semibold">Situação</span>
                  <select value={situacaoLista} onChange={(e) => setSituacaoLista(e.target.value as ObraPublica['situacao'] | '')}
                          className="rounded-full border border-tinta-200 bg-white px-3 py-1.5 text-sm text-tinta-900">
                    <option value="">Qualquer</option>
                    {(Object.keys(SITUACAO_PUBLICA_LABEL) as ObraPublica['situacao'][]).map((s) => (
                      <option key={s} value={s}>{SITUACAO_PUBLICA_LABEL[s]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex w-full min-w-0 items-center gap-2 text-sm text-tinta-700">
                  <span className="sr-only">Buscar por endereço, rua, número, empresa ou bairro</span>
                  <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
                         placeholder="Rua, bairro, nº da licença ou empresa"
                         className="w-full min-w-0 rounded-full border border-tinta-200 bg-white px-4 py-1.5 text-sm text-tinta-900" />
                </label>
                <label className="flex items-center gap-2 text-sm text-tinta-700">
                  <span className="font-semibold">Ordenar</span>
                  <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}
                          className="rounded-full border border-tinta-200 bg-white px-3 py-1.5 text-sm text-tinta-900">
                    <option value="bairro">Por bairro</option>
                    <option value="inicio">Por início</option>
                    <option value="empresa">Por empresa</option>
                    <option value="situacao">Por situação</option>
                  </select>
                </label>
                <div className="flex flex-wrap items-center gap-2 text-sm text-tinta-700">
                  <label className="flex items-center gap-1.5">
                    <span className="font-semibold">De</span>
                    <input type="date" value={periodoIni} onChange={(e) => setPeriodoIni(e.target.value)}
                           className="rounded-full border border-tinta-200 bg-white px-3 py-1 text-sm text-tinta-900" />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="font-semibold">até</span>
                    <input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)}
                           className="rounded-full border border-tinta-200 bg-white px-3 py-1 text-sm text-tinta-900" />
                  </label>
                  {(busca || periodoIni || periodoFim) && (
                    <button type="button" className={linkTexto}
                            onClick={() => { setBusca(''); setPeriodoIni(''); setPeriodoFim(''); }}>
                      Limpar busca e período
                    </button>
                  )}
                </div>
                {filtroAtivo && (
                  <div className="flex w-full flex-wrap items-center gap-2 text-sm" role="status">
                    <span className="text-tinta-600">Filtrando:</span>
                    {filtro.executora && (
                      <button type="button" onClick={() => setFiltro((f) => ({ ...f, executora: null }))}
                              className="inline-flex items-center gap-2 rounded-full border border-marca-700 bg-marca-50 px-3 py-1 font-semibold text-marca-700">
                        {filtro.executora} <span aria-hidden>✕</span>
                        <span className="sr-only">Remover o filtro de executora</span>
                      </button>
                    )}
                    <button type="button" className={linkTexto} onClick={() => setFiltro({ situacao: null, executora: null })}>
                      Limpar filtros
                    </button>
                  </div>
                )}
                {bairro && (
                  <button type="button" onClick={() => setBairro(null)}
                          className="inline-flex items-center gap-2 rounded-full border border-marca-700 bg-marca-50 px-3 py-1 text-sm font-semibold text-marca-700">
                    Bairro: {bairro} <span aria-hidden>✕</span>
                    <span className="sr-only">Mostrar todos os bairros</span>
                  </button>
                )}
              </div>
              {grupos.length === 0 ? (
                <div className="rounded-xl border border-tinta-200 bg-white">
                  <Empty>
                    {mostrarEncerradas
                      ? 'Nenhuma licença de obra registrada até o momento.'
                      : 'Nenhuma obra vigente no momento.'}
                  </Empty>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {grupos.map((g) => (
                    <details key={g.bairro} open className="group rounded-xl border border-tinta-200 bg-white">
                      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3">
                        <span className="font-semibold text-tinta-900">{g.bairro}</span>
                        <span className="text-sm text-tinta-500">
                          {g.obras.length} {g.obras.length === 1 ? 'obra' : 'obras'}
                        </span>
                      </summary>
                      {ordem === 'bairro' && (
                        <div className="border-t border-tinta-100 px-4 py-2 text-right">
                          <button type="button" className={linkTexto}
                                  onClick={() => { setBairro(g.bairro); mapaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            Ver {g.bairro} no mapa
                          </button>
                        </div>
                      )}
                      <ul className="divide-y divide-tinta-100">
                        {g.obras.map((o) => (
                          <li key={o.codigo} id={`obra-${o.codigo}`}
                              className="grid gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]"
                              style={{ boxShadow: `inset 3px 0 0 ${COR_SITUACAO[o.situacao]}` }}
                              onMouseEnter={() => setDestaque(o.codigo)}
                              onMouseLeave={() => setDestaque(null)}
                              onFocus={() => setDestaque(o.codigo)}
                              onBlur={() => setDestaque(null)}>
                            <div className="min-w-0">
                              <span className="font-medium text-tinta-900">
                                {o.trechos[0]?.logradouro ?? 'Local não informado'}
                              </span>
                              <span className="tabular ml-2 text-xs text-tinta-500">nº {o.numero}</span>
                              {o.trechos.length > 1 && <span className="ml-2 text-xs text-tinta-500">e mais {o.trechos.length - 1}</span>}
                              <div className="text-tinta-700">
                                {o.executora}
                                {o.contratante && <span className="text-tinta-500"> · para {nomeLimpo(o.contratante)}</span>}
                              </div>
                              <div className="text-xs text-tinta-500">
                                {rotuloTipos(o.tipos_obra, rotulos)}
                                {` · ${TIPO_INTERVENCAO_LABEL[o.tipo_intervencao]}`}
                                {origemPublica(o.origem) && ` pública · ${ORIGEM_LABEL[o.origem].toLowerCase()}`}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-end">
                              <SeloSituacao situacao={o.situacao} />
                              <span className="tabular text-xs text-tinta-600">
                                {o.inicio_previsto || o.fim_previsto
                                  ? `${o.inicio_previsto ? dataBR(o.inicio_previsto) : '—'} a ${o.fim_previsto ? dataBR(o.fim_previsto) : '—'}`
                                  : 'Sem período informado'}
                              </span>
                              <span className="flex gap-3 text-xs">
                                <Link to={`/licenca/${o.codigo}`} className="font-semibold text-marca-700 hover:underline">Ver licença</Link>
                                {temLocalizacao(o)
                                  ? <button type="button" className="font-semibold text-marca-700 hover:underline"
                                            onClick={() => verNoMapa(o.codigo)}>Ver no mapa</button>
                                  : <span className="text-tinta-500">Sem localização</span>}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              )}
            </section>

              </div>
            </div>
            <ObrasPorMes obras={todas} ano={anoTempo} hoje={hojeISO()} foco={foco} onSelecionar={setFoco} />
            <HistoricoAcervo obras={todas} rotulos={rotulos} />

            <ResumoContratantes contratantes={contratantes} />
            <ResumoExecutoras executoras={executoras}
                              selecionada={filtro.executora}
                              onEscolher={(nome) => setFiltro((f) => ({ ...f, executora: f.executora === nome ? null : nome }))} />

            <ObrasPerto obras={todas} onSelecionar={verNoMapa} />
          </div>
        )}
      </main>
      <Rodape />
    </div>
  );
}

/** Obras vigentes (ou aguardando início) por setor, só os setores com alguma obra. */

/** Vigente ou aguardando início: as obras que a lista mostra por padrão. */
function obraAtiva(o: ObraPublica) {
  return o.situacao === 'vigente' || o.situacao === 'aguardando_inicio';
}

/** Agrupa por bairro do primeiro trecho. Ordem alfabética, com "Sem bairro" por último. */
/** Agrupa por bairro do primeiro trecho. Grafias iguais (Pe/Pé, Ponta Dareia/D'Areia) viram um grupo, com o nome oficial. */
const ROTULO_ORDEM: Record<'inicio' | 'empresa' | 'situacao', string> = {
  inicio: 'Por início do período, mais recente primeiro', empresa: 'Por empresa executora', situacao: 'Por situação',
};
const ORDEM_SITUACAO: Record<ObraPublica['situacao'], number> = {
  vigente: 0, aguardando_inicio: 1, prazo_encerrado: 2, suspensa: 3, concluida: 4, cancelada: 5,
};
function ordenarObras(obras: ObraPublica[], ordem: 'inicio' | 'empresa' | 'situacao'): ObraPublica[] {
  const r = [...obras];
  if (ordem === 'inicio') return r.sort((a, b) => (b.inicio_previsto ?? '').localeCompare(a.inicio_previsto ?? ''));
  if (ordem === 'empresa') return r.sort((a, b) => a.executora.localeCompare(b.executora, 'pt-BR'));
  return r.sort((a, b) => ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao]);
}

function agruparPorBairro(obras: ObraPublica[], oficiais: Map<string, BairroGeo>): { bairro: string; obras: ObraPublica[] }[] {
  const mapa = new Map<string, { nome: string; obras: ObraPublica[] }>();
  for (const o of obras) {
    const bruto = o.trechos[0]?.bairro?.trim() || 'Sem bairro';
    const chave = chaveBairro(bruto);
    const grupo = mapa.get(chave) ?? { nome: oficiais.get(chave)?.nome ?? bruto, obras: [] };
    grupo.obras.push(o);
    mapa.set(chave, grupo);
  }
  return [...mapa.values()]
    .sort((a, b) => (a.nome === 'Sem bairro' ? 1 : b.nome === 'Sem bairro' ? -1 : a.nome.localeCompare(b.nome, 'pt-BR')))
    .map((g) => ({ bairro: g.nome, obras: g.obras }));
}


/** Resumo para a faixa de números do herói, a partir das obras carregadas. */
function resumo(obras: ObraPublica[]) {
  const bairros = new Set<string>();
  const execs = new Set<string>();
  let vigentes = 0;
  for (const o of obras) {
    if (o.situacao === 'vigente' || o.situacao === 'aguardando_inicio') vigentes += 1;
    for (const t of o.trechos) if (t.bairro?.trim()) bairros.add(t.bairro.trim().toLowerCase());
    if (o.executora?.trim()) execs.add(o.executora.trim().toLowerCase());
  }
  return { vigentes, bairros: bairros.size, execs: execs.size, total: obras.length };
}


/** Selo da situação: contorno e cor da própria situação (mesma do mapa). */
function SeloSituacao({ situacao }: { situacao: ObraPublica['situacao'] }) {
  const cor = COR_SITUACAO[situacao];
  return (
    <span className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ color: cor, backgroundColor: `${cor}14` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} aria-hidden />
      {SITUACAO_PUBLICA_LABEL[situacao]}
    </span>
  );
}

function rotuloTipos(tipos: string[], rotulos: Record<string, string>) {
  return tipos.map((t) => rotuloDoTipo(t, rotulos).toLowerCase()).join(', ');
}

const NOMES_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Concessionárias e órgãos contratantes: cada um leva à sua página de obras. */
function ResumoContratantes({ contratantes }: { contratantes: ResumoNome[] }) {
  if (contratantes.length === 0) return null;
  return (
    <section className="mt-4 rounded-xl border border-tinta-200 bg-white p-4" aria-labelledby="contr-titulo">
      <h2 id="contr-titulo" className="text-sm font-semibold text-tinta-900">Concessionárias e órgãos</h2>
      <p className="mt-1 text-xs text-tinta-500">Quem contrata cada obra. Clique para ver as obras de cada um.</p>
      <ul className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        {contratantes.map((c) => (
          <li key={c.chave}>
            <Link to={`/consulta/obras/concessionaria/${encodeURIComponent(c.chave)}`}
                  className="flex w-full items-baseline justify-between gap-3 border-b border-tinta-100 py-1.5 hover:bg-tinta-50">
              <span className="min-w-0 truncate font-medium text-tinta-800 hover:text-marca-700">{c.nome}</span>
              <span className="tabular shrink-0 text-tinta-600">
                <strong className="font-semibold text-alta">{c.vigentes}</strong> vigentes · {c.total} no total
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResumoExecutoras({ executoras, selecionada, onEscolher }: {
  executoras: ResumoNome[]; selecionada: string | null; onEscolher: (nome: string) => void;
}) {
  if (executoras.length === 0) return null;
  return (
    <section className="mt-4 rounded-xl border border-tinta-200 bg-white p-4" aria-labelledby="exec-titulo">
      <h2 id="exec-titulo" className="text-sm font-semibold text-tinta-900">Executoras com obras</h2>
      <p className="mt-1 text-xs text-tinta-500">Obras vigentes e total de licenças de cada executora. Clique para ver só as dela.</p>
      <ul className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        {executoras.map((e) => (
          <li key={e.chave} className="flex items-stretch gap-2 border-b border-tinta-100">
            <button type="button" aria-pressed={selecionada?.toLowerCase() === e.nome.toLowerCase()}
                    onClick={() => onEscolher(e.nome)}
                    className={`flex min-w-0 flex-1 items-baseline justify-between gap-3 py-1.5 text-left hover:bg-tinta-50 ${
                      selecionada?.toLowerCase() === e.nome.toLowerCase() ? 'font-semibold' : ''}`}>
              <span className="min-w-0 truncate text-tinta-800">{e.nome}</span>
              <span className="tabular shrink-0 text-tinta-600">
                <strong className="font-semibold text-alta">{e.vigentes}</strong> vigentes · {e.total} no total
              </span>
            </button>
            <Link to={`/consulta/obras/executora/${encodeURIComponent(e.chave)}`}
                  className="shrink-0 self-center text-xs font-semibold text-marca-700 hover:underline">
              Ver obras
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Legenda() {
  const itens: (keyof typeof COR_SITUACAO)[] = ['vigente', 'aguardando_inicio', 'prazo_encerrado', 'concluida', 'cancelada'];
  return (
    <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-600" aria-label="Legenda">
      {itens.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-4 rounded-full" style={{ background: COR_SITUACAO[s] }} aria-hidden />
          {SITUACAO_PUBLICA_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

/**
 * Obras mais próximas de quem consulta. A posição vem do navegador (com a
 * permissão dele), fica só no estado desta tela e não é enviada nem gravada.
 */
function ObrasPerto({ obras, onSelecionar }: { obras: ObraPublica[]; onSelecionar: (codigo: string) => void }) {
  const [ponto, setPonto] = useState<[number, number] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const localizar = () => {
    if (!navigator.geolocation) { setErro('Este navegador não informa a localização.'); return; }
    setBuscando(true);
    setErro(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPonto([p.coords.longitude, p.coords.latitude]); setBuscando(false); },
      () => { setErro('Não foi possível obter a localização. Verifique a permissão do navegador.'); setBuscando(false); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  };

  const proximas = ponto ? obrasProximas(obras, ponto) : [];
  return (
    <section className="mt-4 rounded-xl border border-tinta-200 bg-white p-4" aria-labelledby="perto-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="perto-titulo" className="text-sm font-semibold text-tinta-900">Obras perto de você</h2>
        <button type="button" className={linkTexto} disabled={buscando} onClick={localizar}>
          {buscando ? 'Localizando…' : ponto ? 'Atualizar localização' : 'Usar minha localização'}
        </button>
      </div>
      <p className="mt-1 text-xs text-tinta-500">Sua localização fica só neste aparelho: não é gravada nem enviada.</p>
      {erro && <p className="mt-2 text-sm text-baixa">{erro}</p>}
      {ponto && proximas.length === 0 && (
        <p className="mt-2 text-sm text-tinta-600">Nenhuma obra com localização nos filtros atuais.</p>
      )}
      {proximas.length > 0 && (
        <ol className="mt-3 divide-y divide-tinta-100">
          {proximas.map(({ obra, metros }) => (
            <li key={obra.codigo} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <button type="button" className="text-left font-medium text-tinta-900 hover:underline"
                      onClick={() => onSelecionar(obra.codigo)}>
                {obra.trechos[0]?.logradouro ?? 'Obra'}{obra.trechos[0]?.bairro ? `, ${obra.trechos[0].bairro}` : ''}
              </button>
              <span className="tabular shrink-0 text-tinta-600">{textoDistancia(metros)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
