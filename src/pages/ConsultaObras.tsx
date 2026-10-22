import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AbasConsulta } from '../components/AbasConsulta';
import FaixaDoTempo from '../components/FaixaDoTempo';
import FichaObra from '../components/FichaObra';
import { Cabecalho } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { Empty, ErrorNote, Kpi, Spinner, Titulo, linkTexto } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { hojeISO } from '../lib/empresas';
import { ORIGEM_LABEL, TIPO_INTERVENCAO_LABEL, origemPublica } from '../lib/licencas';
import { listarTipos, mapaRotulosTipos, rotuloDoTipo } from '../lib/tiposIntervencao';
import {
  COR_SITUACAO, SITUACAO_PUBLICA_LABEL, baixarObrasGeojson, buscarObrasPublicas, obrasProximas,
  temLocalizacao, textoDistancia, type ObraPublica,
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
  const [baixando, setBaixando] = useState(false);
  const mapaRef = useRef<HTMLDivElement>(null);

  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  useEffect(() => { buscarObrasPublicas().then(setObras).catch(setError); }, []);
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

  const todas = obras ?? [];
  const ativas = useMemo(() => todas.filter(obraAtiva), [todas]);
  const porBairro = bairro ? (o: ObraPublica) => (o.trechos[0]?.bairro?.trim() || 'Sem bairro') === bairro : () => true;
  const listadas = (mostrarEncerradas ? todas : ativas).filter(porBairro);
  const grupos = useMemo(() => agruparPorBairro(listadas), [listadas]);
  const executoras = useMemo(() => resumoExecutoras(todas), [todas]);
  const stats = useMemo(() => resumo(todas), [todas]);
  const selecionada = useMemo(() => (obras ?? []).find((o) => o.codigo === foco) ?? null, [obras, foco]);

  return (
    <div className="flex min-h-screen flex-col bg-tinta-50">
      <Cabecalho />

      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <Titulo
          trilha="Consulta pública"
          titulo="Obras licenciadas em Niterói"
          descricao="Consulte no mapa cada obra de infraestrutura licenciada nas vias públicas da cidade: quem executa, em que trecho e até quando o prazo é válido."
        />

        {obras && (
          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
            <Kpi rotulo="Vigentes agora" valor={stats.vigentes} detalhe="obras autorizadas" tom="alta" />
            <Kpi rotulo={stats.bairros === 1 ? 'Bairro' : 'Bairros'} valor={stats.bairros} detalhe="com obra licenciada" />
            <Kpi rotulo={stats.execs === 1 ? 'Executora' : 'Executoras'} valor={stats.execs} detalhe="com obra licenciada" />
            <Kpi rotulo="No cadastro" valor={stats.total} detalhe="licenças registradas" />
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
            {/* Mapa em largura total; a ficha da obra selecionada fica sobre ele. */}
            <div>
              <Suspense fallback={<div className="h-[60vh] min-h-[360px] rounded-xl border border-tinta-200 bg-tinta-50" />}>
                <div className="mb-2 flex justify-end">
                  <div role="group" aria-label="Visualização do mapa" className="inline-flex rounded-full border border-tinta-200 bg-white p-0.5 text-xs font-semibold">
                    {(['pontos', 'calor'] as const).map((m) => (
                      <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}
                              className={`rounded-full px-3 py-1 ${modo === m ? 'bg-marca-700 text-white' : 'text-tinta-600 hover:text-tinta-900'}`}>
                        {m === 'pontos' ? 'Obras' : 'Mapa de calor'}
                      </button>
                    ))}
                  </div>
                </div>
                <div ref={mapaRef} className="relative scroll-mt-4 overflow-hidden rounded-xl border border-tinta-200 shadow-xs">
                  <MapaObras obras={todas} foco={foco} destaque={destaque} modo={modo} bairro={bairro}
                             onSelecionar={setFoco} onBairro={setBairro} onDestacar={setDestaque} />
                  {selecionada && <FichaObra obra={selecionada} onFechar={() => setFoco(null)} />}
                </div>
              </Suspense>
              <Legenda />
              <p className="mt-2 text-xs leading-relaxed text-tinta-500">
                Cada trecho aparece como uma linha reta entre o início e o fim informados na licença, sem seguir o
                traçado da rua. Para o percurso exato, abra a licença.
              </p>
              <p className="mt-2 text-xs text-tinta-500">
                <button type="button" className={linkTexto} disabled={baixando} onClick={() => void baixarGeojson()}>
                  {baixando ? 'Preparando…' : 'Dados abertos: baixar GeoJSON'}
                </button>
                <span className="text-tinta-400">. Todas as obras licenciadas, para uso livre.</span>
              </p>
            </div>

            <FaixaDoTempo obras={todas} ano={new Date().getFullYear()} hoje={hojeISO()} foco={foco} onSelecionar={setFoco} />

            <ObrasPerto obras={todas} onSelecionar={verNoMapa} />
            <ResumoExecutoras executoras={executoras} />

            {/* Lista das obras, agrupada por bairro. Por padrão, só as vigentes ou aguardando início. */}
            <section aria-live="polite" aria-label="Lista das obras e serviços licenciados">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="Quais obras mostrar" className="inline-flex rounded-full border border-tinta-200 bg-white p-0.5 text-sm font-semibold">
                  {([false, true] as const).map((todasAsObras) => (
                    <button key={String(todasAsObras)} type="button" aria-pressed={mostrarEncerradas === todasAsObras}
                            onClick={() => setMostrarEncerradas(todasAsObras)}
                            className={`rounded-full px-4 py-1.5 ${mostrarEncerradas === todasAsObras ? 'bg-marca-700 text-white' : 'text-tinta-600 hover:text-tinta-900'}`}>
                      {todasAsObras ? `Todas (${todas.length})` : `Vigentes (${ativas.length})`}
                    </button>
                  ))}
                </div>
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
                      <div className="border-t border-tinta-100 px-4 py-2 text-right">
                        <button type="button" className={linkTexto}
                                onClick={() => { setBairro(g.bairro); mapaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                          Ver {g.bairro} no mapa
                        </button>
                      </div>
                      <ul className="divide-y divide-tinta-100">
                        {g.obras.map((o) => (
                          <li key={o.codigo}
                              className="grid gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]"
                              style={{ boxShadow: `inset 3px 0 0 ${COR_SITUACAO[o.situacao]}` }}
                              onMouseEnter={() => setDestaque(o.codigo)}
                              onMouseLeave={() => setDestaque(null)}
                              onFocus={() => setDestaque(o.codigo)}
                              onBlur={() => setDestaque(null)}>
                            <div className="min-w-0">
                              <Link to={`/licenca/${o.codigo}`} className="font-medium text-tinta-900 hover:text-marca-700 hover:underline">
                                {o.trechos[0]?.logradouro ?? 'Local não informado'}
                              </Link>
                              <span className="tabular ml-2 text-xs text-tinta-500">nº {o.numero}</span>
                              {o.trechos.length > 1 && <span className="ml-2 text-xs text-tinta-500">e mais {o.trechos.length - 1}</span>}
                              <div className="text-tinta-700">
                                {o.executora}
                                {o.contratante && <span className="text-tinta-500"> · para {o.contratante}</span>}
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
function agruparPorBairro(obras: ObraPublica[]): { bairro: string; obras: ObraPublica[] }[] {
  const mapa = new Map<string, ObraPublica[]>();
  for (const o of obras) {
    const bairro = o.trechos[0]?.bairro?.trim() || 'Sem bairro';
    mapa.set(bairro, [...(mapa.get(bairro) ?? []), o]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a === 'Sem bairro' ? 1 : b === 'Sem bairro' ? -1 : a.localeCompare(b, 'pt-BR')))
    .map(([bairro, lista]) => ({ bairro, obras: lista }));
}

/** Executoras com obras, das que têm mais obras vigentes para as que têm menos. */
function resumoExecutoras(obras: ObraPublica[]) {
  const mapa = new Map<string, { nome: string; vigentes: number; total: number }>();
  for (const o of obras) {
    const nome = o.executora?.trim();
    if (!nome) continue;
    const chave = nome.toLowerCase();
    const atual = mapa.get(chave) ?? { nome, vigentes: 0, total: 0 };
    atual.total += 1;
    if (obraAtiva(o)) atual.vigentes += 1;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.vigentes - a.vigentes || b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
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

function ResumoExecutoras({ executoras }: { executoras: { nome: string; vigentes: number; total: number }[] }) {
  if (executoras.length === 0) return null;
  return (
    <section className="mt-4 rounded-xl border border-tinta-200 bg-white p-4" aria-labelledby="exec-titulo">
      <h2 id="exec-titulo" className="text-sm font-semibold text-tinta-900">Executoras com obras</h2>
      <p className="mt-1 text-xs text-tinta-500">Obras vigentes e total de licenças de cada executora.</p>
      <ul className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        {executoras.map((e) => (
          <li key={e.nome} className="flex items-baseline justify-between gap-3 border-b border-tinta-100 py-1.5">
            <span className="min-w-0 truncate text-tinta-800">{e.nome}</span>
            <span className="tabular shrink-0 text-tinta-600">
              <strong className="font-semibold text-alta">{e.vigentes}</strong> vigentes · {e.total} no total
            </span>
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
