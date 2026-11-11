import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AbasConsulta } from '../components/AbasConsulta';
import FichaObra, { type DetalheObra } from '../components/FichaObra';
import { Cabecalho } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { ErrorNote, Kpi, Spinner, Titulo, linkTexto } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { DIAS_JANELA, buscarComunicacoesPublicas, filtrarComunicacoes, hojeNiteroi, type ComunicacaoPublica } from '../lib/comunicacoesPublicas';
import { ORIGEM_LABEL, TIPO_INTERVENCAO_LABEL, origemPublica } from '../lib/licencas';
import { listarTipos, mapaRotulosTipos, rotuloDoTipo } from '../lib/tiposIntervencao';
import {
  COR_SITUACAO, SITUACAO_PUBLICA_LABEL, baixarObrasGeojson, buscarEstatisticasPublicas, buscarObrasPublicas, nomeLimpo, temLocalizacao,
  type EstatisticasPublicas,
  type ObraPublica,
} from '../lib/obras';

// O mapa (MapLibre) é pesado: só carrega nesta página.
const MapaObras = lazy(() => import('../components/MapaObras'));
/** Obras por lote na lista aberta da consulta pública. */

/** Consulta pública: obras licenciadas pela SECONSER, no mapa e em lista. */
export default function ConsultaObras() {
  const [obras, setObras] = useState<ObraPublica[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [modo, setModo] = useState<'pontos' | 'calor'>('pontos');
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
  // Por padrão, o mapa mostra só o que acontece hoje. O filtro amplia para a janela de 15 dias.
  const [ampliarComunicacoes, setAmpliarComunicacoes] = useState(false);
  const comunicacoesVisiveis = useMemo(
    () => filtrarComunicacoes(comunicacoes, ampliarComunicacoes, hojeNiteroi()),
    [comunicacoes, ampliarComunicacoes],
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
  const listadas = todas;
  const selecionada = useMemo(() => (obras ?? []).find((o) => o.codigo === foco) ?? null, [obras, foco]);

  return (
    <div className="flex min-h-screen flex-col bg-tinta-50">
      <Cabecalho />

      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <Titulo
          trilha="Consulta pública"
          titulo="Obras licenciadas em Niterói"
          descricao="Veja no mapa as obras licenciadas nas vias da cidade: quem executa, onde e até quando."
        />

        {obras && estat && (
          <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
            <Kpi rotulo="Licenças autorizadas nos últimos 12 meses" valor={estat.autorizadas_12m} />
            <Kpi rotulo="Obras concluídas nos últimos 5 anos" valor={estat.concluidas_5a}
                 detalhe={`de ${obras.length} obras no mapa`} />
            <Kpi rotulo={estat.executoras === 1 ? 'Empresa executora' : 'Empresas executoras'} valor={estat.executoras}
                 detalhe={`de ${estat.empresas_ativas} habilitadas no cadastro`} />
          </div>
        )}

        <AbasConsulta />

        <ErrorNote error={error} />
        {!obras && !error && <Spinner label="Carregando as obras…" />}

        {obras && (
          <div className="mt-6 flex flex-col gap-6">
            <div className="min-w-0">
            {/* Mapa em largura total; a ficha da obra selecionada fica sobre ele. */}
            <div>
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
                  <MapaObras obras={listadas} comunicacoes={comunicacoesVisiveis}
                             foco={foco} destaque={destaque} modo={modo} bairro={bairro}
                             onSelecionar={setFoco} onBairro={setBairro} onDestacar={setDestaque} onGrupo={setGrupo} />
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
              {comunicacoesVisiveis.length > 0 && <LegendaComunicacoes />}
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

/** Filtro das comunicações: por padrão, só o que acontece hoje. */
function FiltroComunicacoes({ ampliado, onMudar, visiveis, total }: {
  ampliado: boolean; onMudar: (ampliado: boolean) => void; visiveis: number; total: number;
}) {
  return (
    <section aria-label="Filtro das comunicações ao CISP" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-tinta-600">
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input type="checkbox" className="h-4 w-4 accent-tinta-800" checked={ampliado}
               onChange={(e) => onMudar(e.target.checked)} />
        Mostrar os próximos {DIAS_JANELA} dias (programados) e os {DIAS_JANELA} dias anteriores (emergências)
      </label>
      <span className="text-tinta-500">
        {visiveis} de {total}
      </span>
    </section>
  );
}

/** Comunicações ao CISP: triângulo vermelho (emergência) e quadrado âmbar (serviço programado). */
function LegendaComunicacoes() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-600" aria-label="Legenda das comunicações ao CISP">
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0 w-4 border-t-[5px] border-[#b91c1c]" aria-hidden />
        <span className="inline-block h-2.5 w-2.5 bg-[#b91c1c]" style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} aria-hidden />
        Emergência (comunicada depois do fato)
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0 w-4 border-t-[5px] border-dashed border-[#b45309]" aria-hidden />
        <span className="inline-block h-2.5 w-2.5 bg-[#b45309]" aria-hidden />
        Serviço programado (comunicado antes)
      </li>
    </ul>
  );
}

