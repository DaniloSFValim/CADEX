import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AbasConsulta } from '../components/AbasConsulta';
import FichaObra, { type DetalheObra } from '../components/FichaObra';
import FichaIntervencao from '../components/FichaIntervencao';
import { Cabecalho } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { ErrorNote, Spinner, Titulo, linkTexto } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { DIAS_JANELA, buscarComunicacoesPublicas, filtrarComunicacoes, hojeNiteroi, type ComunicacaoPublica } from '../lib/comunicacoesPublicas';
import { buscarIntervencoesPublicas, filtrarIntervencoes, type IntervencaoPublica } from '../lib/intervencoesPublicas';
import { ORIGEM_LABEL, TIPO_INTERVENCAO_LABEL, origemPublica } from '../lib/licencas';
import { ATRIBUICAO_REDES, REDES_SIGEO, ZOOM_MINIMO_REDES } from '../lib/redesSigeo';
import { listarTipos, mapaRotulosTipos, rotuloDoTipo } from '../lib/tiposIntervencao';
import {
  COR_SITUACAO, SITUACAO_PUBLICA_LABEL, SITUACOES_NO_MAPA, baixarObrasGeojson, buscarEstatisticasPublicas, buscarObrasPublicas, nomeLimpo, temLocalizacao,
  type EstatisticasPublicas,
  type ObraPublica,
} from '../lib/obras';

// O mapa (MapLibre) é pesado: só carrega nesta página.
const MapaObras = lazy(() => import('../components/MapaObras'));
/** Obras por lote na lista aberta da consulta pública. */

/** Categorias do mapa, pela origem do registro. "Todas" é o padrão. */
type Categoria = 'todas' | 'licenciadas' | 'sem_licenca' | 'emergencia' | 'manutencao';
const CATEGORIAS: { valor: Categoria; rotulo: string; cor?: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'licenciadas', rotulo: 'Licenciadas' },
  { valor: 'sem_licenca', rotulo: 'Obras públicas sem licença', cor: '#db2777' },
  { valor: 'emergencia', rotulo: 'Emergências', cor: '#b91c1c' },
  { valor: 'manutencao', rotulo: 'Manutenção de rotina', cor: '#eab308' },
];
/** Situações das licenciadas, pelas datas do cronograma no dia da consulta. */
type SituacaoFiltro = 'todas' | 'aguardando_inicio' | 'vigente' | 'encerrada';
const SITUACOES_FILTRO: { valor: SituacaoFiltro; rotulo: string; cor?: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'aguardando_inicio', rotulo: 'Programadas', cor: '#16a34a' },
  { valor: 'vigente', rotulo: 'Em execução', cor: '#16a34a' },
  { valor: 'encerrada', rotulo: 'Encerradas', cor: '#2563eb' },
];
/** Texto do estado vazio: diz o que significa e o que fazer, sem repetir o rótulo. */
const MENSAGEM_VAZIO: Record<Categoria, string> = {
  todas: 'Nenhum registro no mapa agora.',
  licenciadas: 'Nenhuma obra licenciada nesta situação. Escolha outra situação ou veja todas as obras.',
  sem_licenca: 'Nenhuma obra pública sem licença registrada agora.',
  emergencia: 'Nenhuma emergência registrada agora. Veja todas as obras para o restante do mapa.',
  manutencao: 'Nenhum serviço de manutenção de rotina registrado agora. Veja todas as obras para o restante do mapa.',
};

/** Consulta pública: obras licenciadas pela SECONSER, no mapa e em lista. */
export default function ConsultaObras() {
  const [obras, setObras] = useState<ObraPublica[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [foco, setFoco] = useState<string | null>(null);
  // Obra ou serviço sem licença selecionado no mapa: cartão próprio, no mesmo canto da ficha da licença.
  const [intervencaoSel, setIntervencaoSel] = useState<Record<string, string> | null>(null);
  // Obra pública em destaque no mapa: continua destacada ao clicar numa obra licenciada.
  const [destaqueIntervencao, setDestaqueIntervencao] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [modo, setModo] = useState<'pontos' | 'calor'>('pontos');
  // Camadas de redes marcadas na caixa de camadas. Começa sem nenhuma: o mapa abre limpo.
  const [redesAtivas, setRedesAtivas] = useState<string[]>([]);
  const [categoria, setCategoria] = useState<Categoria>('todas');
  const [situacaoFiltro, setSituacaoFiltro] = useState<SituacaoFiltro>('todas');
  // Por padrão, a consulta mostra todas as obras licenciadas, inclusive as encerradas.
  // Bairro escolhido: destaca o contorno e enquadra no mapa, sem esconder as outras obras.
  const [bairro, setBairro] = useState<string | null>(null);
  // Obras de um agrupamento clicado no mapa: destacadas na lista, sem esconder as demais.
  const [, setGrupo] = useState<string[]>([]);
  // Bairros oficiais por chave: nome canônico e região. Vazio até carregar.
  const [baixando, setBaixando] = useState(false);
  const mapaRef = useRef<HTMLDivElement>(null);

  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  useEffect(() => { buscarObrasPublicas().then(setObras).catch(setError); }, []);
  // Números gerais (contagens do banco). Se falhar, o mapa e a lista continuam.
  const [estat, setEstat] = useState<EstatisticasPublicas | null>(null);
  useEffect(() => { void buscarEstatisticasPublicas().then(setEstat); }, []);
  // Comunicações ao CISP no mapa. Se falhar, o mapa de obras continua sem elas.
  const [comunicacoes, setComunicacoes] = useState<ComunicacaoPublica[]>([]);
  useEffect(() => { buscarComunicacoesPublicas().then(setComunicacoes).catch(() => setComunicacoes([])); }, []);

  const [intervencoes, setIntervencoes] = useState<IntervencaoPublica[]>([]);
  useEffect(() => { buscarIntervencoesPublicas().then(setIntervencoes).catch(() => setIntervencoes([])); }, []);
  // Por padrão, o mapa mostra só o que acontece hoje. O filtro amplia para a janela de 15 dias.
  const [ampliarComunicacoes, setAmpliarComunicacoes] = useState(false);
  const comunicacoesVisiveis = useMemo(
    () => filtrarComunicacoes(comunicacoes, ampliarComunicacoes, hojeNiteroi()),
    [comunicacoes, ampliarComunicacoes],
  );
  const intervencoesVisiveis = useMemo(
    () => filtrarIntervencoes(intervencoes, ampliarComunicacoes, hojeNiteroi()),
    [intervencoes, ampliarComunicacoes],
  );
  // ?obra=CÓDIGO abre o mapa já na obra (vem de "Localizar no mapa" na ficha da licença).
  const [params] = useSearchParams();
  const obraDaUrl = params.get('obra');
  useEffect(() => {
    if (obraDaUrl && obras?.some((o) => o.codigo === obraDaUrl)) setFoco(obraDaUrl);
  }, [obraDaUrl, obras]);
  useEffect(() => { listarTipos().then((t) => setRotulos(mapaRotulosTipos(t))).catch(() => setRotulos({})); }, []);

  async function baixarGeojson() {
    setError(null);
    setBaixando(true);
    try { await baixarObrasGeojson(); }
    catch (e) { setError(e); }
    finally { setBaixando(false); }
  }

  const todas = useMemo(() => obras ?? [], [obras]);
  const listadas = useMemo(() => todas.filter((o) => SITUACOES_NO_MAPA.includes(o.situacao)), [todas]);
  const selecionada = useMemo(() => (obras ?? []).find((o) => o.codigo === foco) ?? null, [obras, foco]);

  // Faixa de contadores e filtros: contam o que o mapa mostra com os filtros atuais de janela.
  const comunicacoesEmergencia = useMemo(() => comunicacoesVisiveis.filter((c) => c.tipo === 'emergencia'), [comunicacoesVisiveis]);
  const comunicacoesManutencao = useMemo(() => comunicacoesVisiveis.filter((c) => c.tipo === 'programado'), [comunicacoesVisiveis]);
  // Obras públicas sem licença: as que cadastramos por conta própria. As de empresa sem licença não entram no público.
  const obrasPublicasSemLicenca = useMemo(() => intervencoesVisiveis.filter((i) => i.categoria === 'publica'), [intervencoesVisiveis]);
  // O que vai para o mapa. "Todas" mantém o comportamento de sempre.
  const licenciadasNoMapa = categoria === 'todas' || categoria === 'licenciadas';
  const obrasNoMapa = !licenciadasNoMapa ? []
    : categoria === 'licenciadas' && situacaoFiltro !== 'todas' ? listadas.filter((o) => o.situacao === situacaoFiltro)
      : listadas;
  const comunicacoesNoMapa = categoria === 'todas' ? comunicacoesVisiveis
    : categoria === 'emergencia' ? comunicacoesEmergencia
      : categoria === 'manutencao' ? comunicacoesManutencao : [];
  const intervencoesNoMapa = categoria === 'todas' || categoria === 'sem_licenca' ? obrasPublicasSemLicenca : [];
  const semRegistro = obrasNoMapa.length + comunicacoesNoMapa.length + intervencoesNoMapa.length === 0;

  return (
    <div className="flex min-h-svh flex-col bg-tinta-50">
      <Cabecalho />

      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <Titulo
          trilha="Consulta pública"
          titulo="Obras licenciadas em Niterói"
          descricao="Veja no mapa as obras licenciadas nas vias da cidade: quem executa, onde e até quando."
        />

        <AbasConsulta />


        <ErrorNote error={error} />
        {!obras && !error && <Spinner label="Carregando as obras…" />}

        {obras && (
          <div className="mt-6 flex flex-col gap-6">
            <div className="min-w-0">
            {/* Mapa em largura total; a ficha da obra selecionada fica sobre ele. */}
            <div>
              {/* Painel: no celular fica acima do mapa; no desktop flutua sobre ele, à esquerda. */}
              <div className="relative">
                {/* taste-skill-ignore: painel flutuante sobre o mapa */}<div className="lg:absolute lg:left-4 lg:top-4 lg:z-20 lg:flex lg:w-[18rem] lg:flex-col lg:gap-4 lg:rounded-xl lg:border lg:border-tinta-200 lg:bg-white/95 lg:p-4 lg:shadow-md lg:backdrop-blur-sm">
                  {obras && estat && (
                    <dl className="mt-6 grid grid-cols-3 gap-3 sm:gap-8 lg:mt-0 lg:grid-cols-1 lg:gap-3">
                      {[
                        { rotulo: 'Licenças autorizadas nos últimos 12 meses', valor: estat.autorizadas_12m },
                        { rotulo: 'Obras concluídas nos últimos 5 anos', valor: estat.concluidas_5a },
                        { rotulo: estat.executoras === 1 ? 'Empresa executora' : 'Empresas executoras', valor: estat.executoras },
                      ].map((k) => (
                        <div key={k.rotulo} className="pt-2 sm:pt-3 lg:flex lg:items-baseline lg:justify-between lg:gap-3 lg:pt-0">
                          <dt className="text-xs font-medium leading-snug text-tinta-600 sm:text-sm lg:text-sm">{k.rotulo}</dt>
                          <dd className="tabular mt-1 text-xl font-semibold tracking-[-0.02em] text-tinta-900 sm:text-3xl lg:mt-0 lg:text-2xl">{k.valor}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
              {/* Categoria primeiro; as situações das licenciadas aparecem só quando "Licenciadas" está escolhida. */}
              <div role="group" aria-label="Categoria no mapa" className="-mx-4 mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                {CATEGORIAS.map((c) => (
                  <button key={c.valor} type="button" aria-pressed={categoria === c.valor}
                          onClick={() => { setCategoria(c.valor); setSituacaoFiltro('todas'); }}
                          className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium ${categoria === c.valor
                            ? 'border-tinta-900 bg-tinta-900 text-white'
                            : 'border-tinta-300 bg-white text-tinta-800 hover:border-tinta-500'}`}>
                    {c.cor && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />}
                    {c.rotulo}
                  </button>
                ))}
              </div>
              {categoria === 'licenciadas' && (
                <div role="group" aria-label="Situação das licenciadas" className="-mx-4 mb-4 flex flex-nowrap items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                  {SITUACOES_FILTRO.map((t) => (
                    <button key={t.valor} type="button" aria-pressed={situacaoFiltro === t.valor} onClick={() => setSituacaoFiltro(t.valor)}
                            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${situacaoFiltro === t.valor
                              ? 'border-tinta-700 bg-tinta-700 text-white'
                              : 'border-tinta-300 bg-white text-tinta-700 hover:border-tinta-500'}`}>
                      {t.cor && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: t.cor }} />}
                      {t.rotulo}
                    </button>
                  ))}
                </div>
              )}
                                {categoria === 'licenciadas' && (
                  <div role="group" aria-label="Situação das licenciadas" className="mb-4 flex flex-wrap items-center gap-2">
                    {SITUACOES_FILTRO.map((t) => (
                      <button key={t.valor} type="button" aria-pressed={situacaoFiltro === t.valor} onClick={() => setSituacaoFiltro(t.valor)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${situacaoFiltro === t.valor
                                ? 'border-tinta-700 bg-tinta-700 text-white'
                                : 'border-tinta-300 bg-white text-tinta-700 hover:border-tinta-500'}`}>
                        {t.cor && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: t.cor }} />}
                        {t.rotulo}
                      </button>
                    ))}
                  </div>
                )}
                </div>
              </div>
              {semRegistro && (
                <p role="status" className="mb-3 text-sm text-tinta-600">
                  {MENSAGEM_VAZIO[categoria]}
                </p>
              )}

              <Suspense fallback={<div className="h-[60vh] min-h-[360px] rounded-xl border border-tinta-200 bg-tinta-50" />}>
                <div ref={mapaRef} className="relative scroll-mt-4 overflow-hidden rounded-xl border border-tinta-200 shadow-xs">
                  {/* Modo do mapa sobre o próprio mapa, para não ocupar uma linha acima dele. */}
                  {/* taste-skill-ignore: controle flutuante sobre o mapa */}<div role="group" aria-label="Visualização do mapa" className="absolute left-3 top-3 z-10 inline-flex lg:left-auto lg:right-16 rounded-full border border-tinta-200 bg-white/95 p-0.5 text-xs font-semibold shadow-sm">
                    {(['pontos', 'calor'] as const).map((m) => (
                      <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}
                              className={`rounded-full px-3 py-1 ${modo === m ? 'bg-marca-700 text-white' : 'text-tinta-600 hover:text-tinta-900'}`}>
                        {m === 'pontos' ? 'Obras' : 'Mapa de calor'}
                      </button>
                    ))}
                  </div>
                  {/* Caixa de camadas: fechada por padrão, para o mapa não ficar carregado de linhas. */}
                  {/* taste-skill-ignore: caixa flutuante sobre o mapa */}<details className="absolute bottom-3 left-3 z-10 max-w-[min(18rem,calc(100%-1.5rem))] rounded-lg border border-tinta-200 bg-white/95 text-xs text-tinta-800 shadow-sm">
                    <summary className="cursor-pointer select-none px-3 py-2 font-semibold">
                      Camadas de redes{redesAtivas.length > 0 ? ` (${redesAtivas.length})` : ''}
                    </summary>
                    <div className="space-y-1.5 border-t border-tinta-200 px-3 py-2">
                      {REDES_SIGEO.map((r) => (
                        <label key={r.id} className="flex cursor-pointer items-center gap-2">
                          <input type="checkbox" className="accent-marca-700"
                                 checked={redesAtivas.includes(r.id)}
                                 onChange={(e) => setRedesAtivas((atual) => e.target.checked
                                   ? [...atual, r.id]
                                   : atual.filter((x) => x !== r.id))} />
                          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: r.cor }} />
                          {r.rotulo}
                        </label>
                      ))}
                      <p className="pt-1 text-tinta-500">As redes aparecem a partir do zoom {ZOOM_MINIMO_REDES}. {ATRIBUICAO_REDES}.</p>
                    </div>
                  </details>
                  <MapaObras obras={obrasNoMapa} comunicacoes={comunicacoesNoMapa} intervencoes={intervencoesNoMapa}
                             foco={foco} destaque={destaque} modo={modo} bairro={bairro} redesAtivas={redesAtivas}
                             onSelecionar={(c) => { setIntervencaoSel(null); setFoco(c); }}
                             onIntervencao={(d) => { setFoco(null); setIntervencaoSel(d); setDestaqueIntervencao(d.id ?? null); }}
                             intervencaoFoco={destaqueIntervencao}
                             onBairro={setBairro} onDestacar={setDestaque} onGrupo={setGrupo} />
                  {!selecionada && intervencaoSel && (
                    <FichaIntervencao dados={intervencaoSel} onFechar={() => { setIntervencaoSel(null); setDestaqueIntervencao(null); }} />
                  )}
                  {selecionada && (
                    <FichaObra obra={selecionada} onFechar={() => setFoco(null)} detalhes={detalhesDaObra(selecionada, rotulos)} />
                  )}
                </div>
              </Suspense>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <Legenda />
                <p className="text-xs text-tinta-600">
                  <button type="button" className={linkTexto} disabled={baixando} onClick={() => void baixarGeojson()}>
                    {baixando ? 'Preparando…' : 'Dados abertos: baixar GeoJSON'}
                  </button>
                  <span className="text-tinta-400">. Todas as obras licenciadas, para uso livre.</span>
                </p>
              </div>
              {comunicacoes.length > 0 && (
                <FiltroComunicacoes ampliado={ampliarComunicacoes} onMudar={setAmpliarComunicacoes}
                                    visiveis={comunicacoesVisiveis.length} total={comunicacoes.length} />
              )}
              <LegendaComunicacoes />
            </div>
            </div>
          </div>
        )}
      </main>
      <Rodape />
    </div>
  );
}

/** Obras vigentes (ou aguardando início) por setor, só os setores com alguma obra. */

/** Vigente ou aguardando início: as obras que a lista mostra por padrão. */
/** Posição da obra na lista inteira (bairros na ordem mostrada), ou -1 se não estiver nela. */
function detalhesDaObra(o: ObraPublica, rotulos: Record<string, string>): DetalheObra[] {
  const periodo = o.inicio_previsto || o.fim_previsto
    ? `${o.inicio_previsto ? dataBR(o.inicio_previsto) : '—'} a ${o.fim_previsto ? dataBR(o.fim_previsto) : '—'}`
    : 'Sem período informado';
  const tipo = `${rotuloTipos(o.tipos_obra, rotulos)} · ${TIPO_INTERVENCAO_LABEL[o.tipo_intervencao]}`
    + (origemPublica(o.origem) ? ` pública · ${ORIGEM_LABEL[o.origem].toLowerCase()}` : '');
  return [
    o.executora ? { rotulo: 'Executora', valor: o.executora } : null,
    o.contratante ? { rotulo: 'Contratante', valor: nomeLimpo(o.contratante) } : null,
    { rotulo: 'Período', valor: periodo },
    { rotulo: 'Tipo', valor: tipo },
    temLocalizacao(o) ? null : { rotulo: 'Mapa', valor: 'Sem localização, não aparece no mapa' },
  ].filter((d): d is DetalheObra => d !== null);
}

function rotuloTipos(tipos: string[], rotulos: Record<string, string>) {
  return tipos.map((t) => rotuloDoTipo(t, rotulos).toLowerCase()).join(', ');
}


function Legenda() {
  const itens: { cor: string; rotulo: string }[] = [
    { cor: COR_SITUACAO.vigente, rotulo: 'Em execução ou programada' },
    { cor: COR_SITUACAO.encerrada, rotulo: SITUACAO_PUBLICA_LABEL.encerrada },
  ];
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-tinta-800" aria-label="Legenda">
      {itens.map((s) => (
        <li key={s.rotulo} className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-full" style={{ background: s.cor }} aria-hidden />
          {s.rotulo}
        </li>
      ))}
    </ul>
  );
}

/** Filtro das comunicações: por padrão, só o que acontece hoje. */
function FiltroComunicacoes({ ampliado, onMudar, visiveis, total }: {
  ampliado: boolean; onMudar: (ampliado: boolean) => void; visiveis: number; total: number;
}) {
  return (
    <section aria-label="Filtro das comunicações ao CISP" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-tinta-600">
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input type="checkbox" className="h-4 w-4 accent-tinta-800" checked={ampliado}
               onChange={(e) => onMudar(e.target.checked)} />
        Mostrar os próximos {DIAS_JANELA} dias (programados e obras sem licença) e os {DIAS_JANELA} dias anteriores (emergências)
      </label>
      <span className="text-tinta-500">
        {visiveis} de {total}
      </span>
    </section>
  );
}

/** Comunicações ao CISP e obras sem licença: cada forma e cor do mapa. */
function LegendaComunicacoes() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-600" aria-label="Legenda das comunicações ao CISP e das obras públicas sem licença">
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0 w-4 border-t-[5px] border-[#b91c1c]" aria-hidden />
        <span className="inline-block h-2.5 w-2.5 bg-[#b91c1c]" style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} aria-hidden />
        Emergência (ligação ao CISP antes de agir)
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0 w-4 border-t-[5px] border-dashed border-[#eab308]" aria-hidden />
        <span className="inline-block h-2.5 w-2.5 bg-[#eab308]" aria-hidden />
        Serviço programado (comunicado antes)
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0 w-4 border-t-[5px] border-[#db2777]" aria-hidden />
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#db2777]" aria-hidden />
        Obra pública sem licença
      </li>
    </ul>
  );
}

