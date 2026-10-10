import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AbasConsulta } from '../components/AbasConsulta';
import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { Empty, ErrorNote, Spinner, inputClass, linkTexto } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { SETORES, SETOR_LABEL } from '../lib/empresas';
import { TIPO_OBRA_LABEL } from '../lib/licencas';
import {
  COR_SITUACAO, FILTRO_OBRAS, SITUACAO_PUBLICA_LABEL, anosDasObras, baixarObrasGeojson, buscarObrasPublicas, filtrarObras,
  type ObraPublica,
} from '../lib/obras';

// O mapa (MapLibre) é pesado: só carrega nesta página.
const MapaObras = lazy(() => import('../components/MapaObras'));

/** Consulta pública: obras licenciadas pela SECONSER, no mapa e em lista. */
export default function ConsultaObras() {
  const [obras, setObras] = useState<ObraPublica[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [situacao, setSituacao] = useState('vigentes');
  const [ano, setAno] = useState('');
  const [setor, setSetor] = useState('');
  const [busca, setBusca] = useState('');
  const [foco, setFoco] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => { buscarObrasPublicas().then(setObras).catch(setError); }, []);

  async function baixarGeojson() {
    setError(null);
    setBaixando(true);
    try { await baixarObrasGeojson(); }
    catch (e) { setError(e); }
    finally { setBaixando(false); }
  }

  const filtradas = useMemo(() => filtrarObras(obras ?? [], { situacao, ano, busca, setor }), [obras, situacao, ano, busca, setor]);
  const anos = useMemo(() => anosDasObras(obras ?? []), [obras]);

  return (
    <div className="flex min-h-screen flex-col bg-tinta-50">
      <Cabecalho itens={MENU_PUBLICO} />

      {/* Herói: título e a promessa da página. Sem painel de números: quem
          quer contagem a encontra na lista, abaixo das abas. */}
      <section className="border-b border-tinta-200 bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-12">
          <p className="text-sm font-medium text-tinta-500">Resolução Conjunta SECONSER/SEOP nº&nbsp;001/2026</p>
          <h1 className="mt-2 max-w-[22ch] text-3xl font-bold leading-[1.1] tracking-tight text-tinta-900 sm:text-4xl">
            Onde Niterói está com obras nas ruas
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-tinta-600">
            Consulte no mapa cada obra de infraestrutura licenciada nas vias públicas da cidade — quem executa,
            em que trecho e até quando o prazo é válido.
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <AbasConsulta />

        {/* Filtros numa superfície clara, logo abaixo das abas. */}
        <div className="mt-5 rounded-xl border border-tinta-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_190px_240px_140px]">
            <input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar obra"
                   placeholder="Rua, bairro, empresa ou nº da licença" />
            <select className={inputClass} value={setor} onChange={(e) => setSetor(e.target.value)} aria-label="Setor">
              <option value="">Todos os setores</option>
              {SETORES.map((st) => <option key={st} value={st}>{SETOR_LABEL[st]}</option>)}
            </select>
            <select className={inputClass} value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
              {FILTRO_OBRAS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
            </select>
            <select className={inputClass} value={ano} onChange={(e) => setAno(e.target.value)} aria-label="Ano de emissão">
              <option value="">Todos os anos</option>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <ErrorNote error={error} />
        {!obras && !error && <Spinner label="Carregando as obras…" />}

        {obras && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
            {/* Coluna do mapa (fixa no desktop enquanto a lista rola). */}
            <div className="lg:sticky lg:top-[84px]">
              <Suspense fallback={<div className="h-[60vh] min-h-[360px] rounded-xl border border-tinta-200 bg-tinta-50" />}>
                <div className="overflow-hidden rounded-xl border border-tinta-200">
                  <MapaObras obras={filtradas} foco={foco} />
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
                <span className="text-tinta-400"> — todas as obras licenciadas, para uso livre.</span>
              </p>
            </div>

            {/* Coluna da lista, viva ao lado do mapa. */}
            <section aria-live="polite">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-bold tracking-[-0.01em] text-tinta-900">Obras licenciadas</h2>
                <span className="text-sm text-tinta-500">
                  {filtradas.length}{filtradas.length !== obras.length && ` de ${obras.length}`}
                </span>
              </div>

              {filtradas.length === 0 ? (
                <div className="rounded-xl border border-tinta-200 bg-white">
                  <Empty>
                    {obras.length === 0 ? 'Nenhuma licença de obra registrada até o momento.'
                      : situacao === 'vigentes' ? 'Nenhuma obra vigente agora. Escolha "Todas as licenças" para ver as anteriores.'
                        : 'Nenhuma licença corresponde à busca.'}
                  </Empty>
                </div>
              ) : (
                <ul className="divide-y divide-tinta-100 overflow-hidden rounded-xl border border-tinta-200 bg-white">
                  {filtradas.map((o) => (
                    <li key={o.codigo} className="border-l-[3px] px-4 py-3.5 transition-colors hover:bg-tinta-50"
                        style={{ borderLeftColor: COR_SITUACAO[o.situacao] }}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 font-medium text-tinta-900">
                          {o.trechos[0]?.logradouro}
                          {o.trechos[0]?.bairro && <span className="font-normal text-tinta-500">, {o.trechos[0].bairro}</span>}
                          {o.trechos.length > 1 && <span className="text-sm text-tinta-500"> e mais {o.trechos.length - 1}</span>}
                        </p>
                        <SeloSituacao situacao={o.situacao} />
                      </div>
                      <p className="mt-1 text-sm text-tinta-600">
                        {o.executora}{o.contratante && `, para ${o.contratante}`}
                        <span className="text-tinta-500">; {o.tipos_obra.map((t) => TIPO_OBRA_LABEL[t].toLowerCase()).join(', ')}</span>
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        <span className="tabular text-tinta-500">{dataBR(o.inicio_previsto)} a {dataBR(o.fim_previsto)}</span>
                        <button type="button" className="font-semibold text-marca-600 hover:underline"
                                onClick={() => { setFoco(o.codigo); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                          Ver no mapa
                        </button>
                        <Link to={`/licenca/${o.codigo}`} className="tabular font-medium text-marca-600 hover:underline">
                          nº&nbsp;{o.numero}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
      <Rodape />
    </div>
  );
}

/** Resumo para a faixa de números do herói, a partir das obras carregadas. */

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
