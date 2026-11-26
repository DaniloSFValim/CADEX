import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AbasConsulta } from '../components/AbasConsulta';
import FichaObra, { type DetalheObra } from '../components/FichaObra';
import FichaIntervencao from '../components/FichaIntervencao';
import { Cabecalho } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { ErrorNote, Kpi, Spinner, Titulo, linkTexto } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { DIAS_JANELA, buscarComunicacoesPublicas, filtrarComunicacoes, hojeNiteroi, type ComunicacaoPublica } from '../lib/comunicacoesPublicas';
import { buscarIntervencoesPublicas, filtrarIntervencoes, type IntervencaoPublica } from '../lib/intervencoesPublicas';
import { ORIGEM_LABEL, TIPO_INTERVENCAO_LABEL, origemPublica } from '../lib/licencas';
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
  { valor: 'sem_licenca', rotulo: 'Obras públicas sem licença', cor: '#7c3aed' },
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
const ROTULO_CATEGORIA: Record<Categoria, string> = {
  todas: 'Todas', licenciadas: 'Licenciadas', sem_licenca: 'Obras públicas sem licença',
  emergencia: 'Emergências', manutencao: 'Manutenção de rotina',
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
    <div className="flex min-h-screen flex-col bg-tinta-50">
      <Cabecalho />

      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <Titulo
          trilha="Consulta pública"
          titulo="Obras licenciadas em Niterói"
          descricao="Veja no mapa as obras licenciadas nas vias da cidade: quem executa, onde e até quando."
        />

        <AbasConsulta />

        {obras && estat && (
          <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
            <Kpi rotulo="Licenças autorizadas nos últimos 12 meses" valor={estat.autorizadas_12m} />
            <Kpi rotulo="Obras concluídas nos últimos 5 anos" valor={estat.concluidas_5a}
                 detalhe={`de ${obras.length} obras no mapa`} />
            <Kpi rotulo={estat.executoras === 1 ? 'Empresa executora' : 'Empresas executoras'} valor={estat.executoras}
                 detalhe={`de ${estat.empresas_ativas} habilitadas no cadastro`} />
          </div>
        )}


        <ErrorNote error={error} />
        {!obras && !error && <Spinner label="Carregando as obras…" />}

        {obras && (
          <div className="mt-6 flex flex-col gap-6">
            <div className="min-w-0">
            {/* Mapa em largura total; a ficha da obra selecionada fica sobre ele. */}
            <div>
              {/* Categoria primeiro; as situações das licenciadas aparecem só quando "Licenciadas" está escolhida. */}
              <div role="group" aria-label="Categoria no mapa" className="mb-3 flex flex-wrap items-center gap-2">
                {CATEGORIAS.map((c) => (
                  <button key={c.valor} type="button" aria-pressed={categoria === c.valor}
                          onClick={() => { setCategoria(c.valor); setSituacaoFiltro('todas'); }}
                          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium ${categoria === c.valor
                            ? 'border-tinta-900 bg-tinta-900 text-white'
                            : 'border-tinta-300 bg-white text-tinta-800 hover:border-tinta-500'}`}>
                    {c.cor && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />}
                    {c.rotulo}
                  </button>
                ))}
              </div>
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
              {semRegistro && (
                <p role="status" className="mb-3 text-sm text-tinta-600">
                  Nenhum registro em "{ROTULO_CATEGORIA[categoria]}" agora.
                </p>
              )}

              <Suspense fallback={<div className="h-[60vh] min-h-[360px] rounded-xl border border-tinta-200 bg-tinta-50" />}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-tinta-600">
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
                <div ref={mapaRef} className="relative scroll-mt-4 overflow-hidden rounded-xl border border-tinta-200 shadow-xs">
                  <MapaObras obras={obrasNoMapa} comunicacoes={comunicacoesNoMapa} intervencoes={intervencoesNoMapa}
                             foco={foco} destaque={destaque} modo={modo} bairro={bairro}
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
              <Legenda />
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
    <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-tinta-800" aria-label="Legenda">
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
        <span className="inline-block h-0 w-4 border-t-[5px] border-[#7c3aed]" aria-hidden />
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#7c3aed]" aria-hidden />
        Obra pública sem licença
      </li>
    </ul>
  );
}

