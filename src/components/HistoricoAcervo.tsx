import { resumoHistorico, temTendencia, ANOS_MINIMOS_TENDENCIA, type ResumoHistorico } from '../lib/historico';
import type { ObraPublica } from '../lib/obras';

/** Altura, em pixels, da coluna do ano com mais licenças. */
const ALTURA = 96;

/**
 * Histórico do acervo: quantas licenças há por ano de início, quem contrata e
 * quais tipos de obra são mais frequentes. Sem medida de conclusão.
 */
export default function HistoricoAcervo({ obras, rotulos }: {
  obras: ObraPublica[]; rotulos: Record<string, string>;
}) {
  const r = resumoHistorico(obras);
  if (r.total === 0) return null;
  const tendencia = temTendencia(r);
  const maximo = Math.max(1, ...r.anos.map((a) => a.total));
  const pctPublico = r.total === 0 ? 0 : Math.round((r.publico / r.total) * 100);

  return (
    <section aria-labelledby="historico-titulo" className="mt-4 rounded-xl border border-tinta-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="historico-titulo" className="font-display text-base font-bold text-tinta-900">Histórico do acervo</h2>
        <span className="text-xs text-tinta-500">{r.total} licenças registradas</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Numero rotulo="Média por ano" valor={r.mediaPorAno.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} />
        <Numero rotulo="De órgão público" valor={`${pctPublico}%`} />
        <Numero rotulo="Anos com registro" valor={String(r.anosComDado)} />
      </dl>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-tinta-900">Licenças por ano de início</h3>
        {!tendencia && (
          <p className="mt-1 text-xs text-tinta-500">
            Amostra pequena: há registros em {r.anosComDado} {r.anosComDado === 1 ? 'ano' : 'anos'}.
            A comparação entre anos só aparece com {ANOS_MINIMOS_TENDENCIA} anos de registro.
          </p>
        )}
        <Anual r={r} maximo={maximo} />
        <p className="mt-2 flex gap-4 text-xs text-tinta-600">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-marca-600" aria-hidden />Órgão público</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-marca-200" aria-hidden />Empresa</span>
        </p>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-tinta-900">Tipos de obra mais frequentes</h3>
        <ul className="mt-2 space-y-2">
          {r.tipos.slice(0, 6).map((t) => (
            <li key={t.codigo} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate text-tinta-700">{rotulos[t.codigo] ?? t.codigo}</span>
              <span className="h-2 rounded-full bg-tinta-100" aria-hidden>
                <span className="block h-2 rounded-full bg-marca-600"
                      style={{ width: `${(t.total / r.tipos[0].total) * 100}%` }} />
              </span>
              <span className="tabular-nums text-tinta-700">{t.total}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg bg-tinta-50 px-3 py-2">
      <dt className="text-xs text-tinta-500">{rotulo}</dt>
      <dd className="font-display text-lg font-bold tabular-nums text-tinta-900">{valor}</dd>
    </div>
  );
}

function Anual({ r, maximo }: { r: ResumoHistorico; maximo: number }) {
  return (
    <div className="mt-3 flex items-end gap-2 overflow-x-auto pb-1" style={{ height: ALTURA + 28 }}>
      {r.anos.map((a) => (
        <div key={a.ano} className="flex min-w-[2.5rem] flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs font-semibold tabular-nums text-tinta-700">{a.total}</span>
          <div className="flex w-full flex-col-reverse overflow-hidden rounded-t"
               style={{ height: Math.max(4, (a.total / maximo) * ALTURA) }}
               title={`${a.ano}: ${a.publico} de órgão público, ${a.empresa} de empresa`}>
            <span className="bg-marca-600" style={{ flexGrow: a.publico }} />
            <span className="bg-marca-200" style={{ flexGrow: a.empresa }} />
          </div>
          <span className="text-xs text-tinta-500">{a.ano}</span>
        </div>
      ))}
    </div>
  );
}
