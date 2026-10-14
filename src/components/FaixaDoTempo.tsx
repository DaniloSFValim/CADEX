import { COR_SITUACAO, SITUACAO_PUBLICA_LABEL, barraNoAno, fracaoDoAno, type ObraPublica } from '../lib/obras';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Quantas obras a faixa mostra; o resto fica na lista, com aviso. */
const MAX_LINHAS = 30;

/**
 * Faixa do tempo: cada obra que toca o ano vira uma barra na linha dela, na cor da
 * situação. A linha vertical marca hoje. Clicar numa barra seleciona a obra no mapa.
 */
export default function FaixaDoTempo({ obras, ano, hoje, foco, onSelecionar }: {
  obras: ObraPublica[]; ano: number; hoje: string; foco: string | null; onSelecionar: (codigo: string) => void;
}) {
  const barras = obras
    .map((o) => ({ o, barra: barraNoAno(o, ano) }))
    .filter((x): x is { o: ObraPublica; barra: NonNullable<ReturnType<typeof barraNoAno>> } => x.barra !== null)
    .sort((a, b) => (a.o.inicio_previsto ?? '').localeCompare(b.o.inicio_previsto ?? ''));
  const mostradas = barras.slice(0, MAX_LINHAS);
  const hojeFracao = fracaoDoAno(hoje, ano);

  return (
    <section aria-label="Faixa do tempo das obras" className="rounded-xl border border-tinta-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-tinta-100 px-4 py-3">
        <h2 className="font-display text-base font-bold text-tinta-900">Obras em {ano}</h2>
        <span className="text-xs text-tinta-500">
          {barras.length === 0 ? 'Nenhuma obra com período neste ano' : `${barras.length} com período neste ano`}
        </span>
      </div>

      {barras.length > 0 && (
        <div className="px-4 pb-3 pt-2">
          <div className="grid grid-cols-12 gap-0 text-[11px] text-tinta-500" aria-hidden>
            {MESES.map((m) => <span key={m} className="border-l border-tinta-100 pl-1">{m}</span>)}
          </div>
          <div className="relative mt-1">
          <ul className="space-y-1">
            {mostradas.map(({ o, barra }) => {
              const cor = COR_SITUACAO[o.situacao];
              const ativa = foco === o.codigo;
              return (
                <li key={o.codigo} className="relative h-6">
                  <span className="absolute inset-y-0 left-0 right-0 border-b border-dashed border-tinta-100" aria-hidden />
                  <button
                    type="button"
                    onClick={() => onSelecionar(o.codigo)}
                    aria-label={`${o.trechos[0]?.logradouro ?? 'Obra'}, ${SITUACAO_PUBLICA_LABEL[o.situacao]}, de ${o.inicio_previsto} a ${o.fim_previsto}`}
                    aria-pressed={ativa}
                    title={`${o.trechos[0]?.logradouro ?? ''} · ${o.executora}`}
                    className={`absolute inset-y-1 rounded-sm transition-opacity hover:opacity-80 ${ativa ? 'ring-2 ring-tinta-900 ring-offset-1' : ''}`}
                    style={{
                      left: `${barra.esquerda * 100}%`,
                      width: `${barra.largura * 100}%`,
                      minWidth: '3px',
                      background: cor,
                    }}
                  />
                </li>
              );
            })}
          </ul>
          {hojeFracao >= 0 && hojeFracao <= 1 && (
            <span
              className="pointer-events-none absolute inset-y-0 w-px bg-tinta-900/60"
              style={{ left: `${hojeFracao * 100}%` }}
              aria-hidden
              title="Hoje"
            />
          )}
          </div>
          {barras.length > MAX_LINHAS && (
            <p className="mt-2 text-xs text-tinta-500">
              Mostrando {MAX_LINHAS} de {barras.length}. As demais estão na lista abaixo.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
