import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AbasConsulta } from '../components/AbasConsulta';
import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { Empty, ErrorNote, Spinner, inputClass } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { TIPO_OBRA_LABEL } from '../lib/licencas';
import {
  COR_SITUACAO, FILTRO_OBRAS, SITUACAO_PUBLICA_LABEL, anosDasObras, buscarObrasPublicas, filtrarObras,
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
  const [busca, setBusca] = useState('');
  const [foco, setFoco] = useState<string | null>(null);

  useEffect(() => { buscarObrasPublicas().then(setObras).catch(setError); }, []);

  const filtradas = useMemo(() => filtrarObras(obras ?? [], { situacao, ano, busca }), [obras, situacao, ano, busca]);
  const anos = useMemo(() => anosDasObras(obras ?? []), [obras]);

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho itens={MENU_PUBLICO} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
        <header className="max-w-4xl pt-2">
          <p className="text-sm text-tinta-400">Consulta pública, Resolução Conjunta SECONSER/SEOP nº&nbsp;001/2026</p>
          <h1 className="mt-3 text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-tinta-900 sm:text-4xl md:text-[3rem]">
            Obras licenciadas
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-tinta-500">
            Onde a SECONSER licenciou obras de infraestrutura nas vias públicas de Niterói, de quem são e até quando valem.
          </p>
        </header>

        <AbasConsulta />

        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_260px_140px]">
          <input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar obra"
                 placeholder="Rua, bairro, empresa ou nº da licença" />
          <select className={inputClass} value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
            {FILTRO_OBRAS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
          <select className={inputClass} value={ano} onChange={(e) => setAno(e.target.value)} aria-label="Ano de emissão">
            <option value="">Todos os anos</option>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <ErrorNote error={error} />
        {!obras && !error && <Spinner label="Carregando as obras…" />}

        {obras && (
          <>
            <div className="mt-4">
              <Suspense fallback={<div className="h-[60vh] min-h-[360px] rounded border border-tinta-200 bg-tinta-50" />}>
                <MapaObras obras={filtradas} foco={foco} />
              </Suspense>
              <Legenda />
              <p className="mt-1 text-xs text-tinta-500">
                Cada trecho aparece como uma linha reta entre o início e o fim informados na licença, sem seguir o
                traçado da rua. Para o percurso exato, abra a licença.
              </p>
            </div>

            <section className="mt-8" aria-live="polite">
              <p className="mb-3 text-sm text-tinta-500">
                {filtradas.length} licença{filtradas.length === 1 ? '' : 's'}
                {filtradas.length !== obras.length && ` de ${obras.length}`}
              </p>
              {filtradas.length === 0 ? (
                <div className="cartao">
                  <Empty>
                    {obras.length === 0 ? 'Nenhuma licença de obra registrada até o momento.'
                      : situacao === 'vigentes' ? 'Nenhuma obra vigente agora. Escolha "Todas as licenças" para ver as anteriores.'
                        : 'Nenhuma licença corresponde à busca.'}
                  </Empty>
                </div>
              ) : (
                <ul className="cartao divide-y divide-tinta-100 overflow-hidden">
                  {filtradas.map((o) => (
                    <li key={o.codigo} className="grid gap-x-6 gap-y-1 border-l-4 px-5 py-3 md:grid-cols-[170px_1fr_auto]"
                        style={{ borderLeftColor: COR_SITUACAO[o.situacao] }}>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: COR_SITUACAO[o.situacao] }}>
                          {SITUACAO_PUBLICA_LABEL[o.situacao]}
                        </div>
                        <div className="tabular text-xs text-tinta-500">{dataBR(o.inicio_previsto)} a {dataBR(o.fim_previsto)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-tinta-900">
                          {o.trechos[0]?.logradouro}{o.trechos[0]?.bairro && <span className="text-tinta-500">, {o.trechos[0].bairro}</span>}
                          {o.trechos.length > 1 && <span className="text-sm text-tinta-500"> e mais {o.trechos.length - 1}</span>}
                        </div>
                        <div className="text-sm text-tinta-600">
                          {o.executora}{o.contratante && `, para ${o.contratante}`}; {o.tipos_obra.map((t) => TIPO_OBRA_LABEL[t].toLowerCase()).join(', ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <button type="button" className="font-semibold text-marca-600 hover:underline"
                                onClick={() => { setFoco(o.codigo); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                          Ver no mapa
                        </button>
                        <Link to={`/licenca/${o.codigo}`} className="font-semibold text-marca-600 hover:underline">
                          Licença {o.numero}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <Rodape />
    </div>
  );
}

function Legenda() {
  const itens: (keyof typeof COR_SITUACAO)[] = ['vigente', 'aguardando_inicio', 'prazo_encerrado', 'concluida', 'cancelada'];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-600" aria-label="Legenda">
      {itens.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-4 rounded-full" style={{ background: COR_SITUACAO[s] }} aria-hidden />
          {SITUACAO_PUBLICA_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}
