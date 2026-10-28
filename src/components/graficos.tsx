import { Link } from 'react-router-dom';
import { dataBR } from './Situacao';
import { ESTADO_LICENCA_LABEL, type EstadoLicenca } from '../lib/licencas';
import { posicaoNaJanela, type ItemLinha } from '../lib/painel';

// ---------------------------------------------------------------------
// Gráficos do painel, em HTML e CSS: sem biblioteca, sem dado de enfeite.
// Todo valor aparece escrito ao lado da marca (nada depende do tooltip) e
// cada gráfico que não rotula todos os pontos tem uma tabela equivalente.
// Barras finas, canto externo arredondado, base reta.
// ---------------------------------------------------------------------

/** Cor da marca de cada situação. A cor reforça; o nome da situação sempre está escrito. */
export const COR_ESTADO: Record<EstadoLicenca, string> = {
  aguardando_inicio: 'bg-tinta-400',
  registro: 'bg-tinta-300',
  em_execucao: 'bg-marca-600',
  prazo_encerrado: 'bg-baixa',
  concluida: 'bg-alta',
  concluida_sem_as_built: 'bg-atencao',
  em_analise: 'bg-tinta-300',
  cancelada: 'bg-tinta-300',
  indeferida: 'bg-tinta-300',
};

export interface ItemBarra { chave: string; rotulo: string; n: number }

/**
 * Barras horizontais: rótulo, barra e valor na ponta. Com `onSelecionar`, cada
 * linha vira um botão que aplica o filtro; clicar de novo na selecionada o tira.
 */
export function BarrasHorizontais({ itens, total, selecionada, onSelecionar, cor = 'bg-marca-600' }: {
  itens: ItemBarra[]; total: number; selecionada?: string; cor?: string;
  onSelecionar?: (chave: string) => void;
}) {
  const maximo = Math.max(...itens.map((i) => i.n), 1);
  return (
    <ul className="space-y-1">
      {itens.map((i) => {
        const pct = total > 0 ? Math.round((i.n / total) * 100) : 0;
        const ativa = selecionada === i.chave;
        const conteudo = (
          <>
            <span className="min-w-0 truncate text-left text-sm text-tinta-700" title={i.rotulo}>{i.rotulo}</span>
            <span className="relative h-3" aria-hidden>
              <span className={`absolute inset-y-0 left-0 rounded-r ${cor}`} style={{ width: `${(i.n / maximo) * 100}%`, minWidth: i.n > 0 ? '3px' : 0 }} />
            </span>
            <span className="text-right text-sm font-semibold text-tinta-900">{i.n}</span>
          </>
        );
        const grade = 'grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_1fr_2.5rem]';
        return (
          <li key={i.chave} title={`${i.rotulo}: ${i.n} (${pct}%)`}>
            {onSelecionar ? (
              <button type="button" aria-pressed={ativa} onClick={() => onSelecionar(i.chave)}
                      className={`${grade} min-h-9 w-full rounded-sm px-2 py-1 text-left transition-colors hover:bg-tinta-50 ${ativa ? 'bg-marca-50 ring-1 ring-marca-300' : ''}`}>
                {conteudo}
              </button>
            ) : <div className={`${grade} min-h-9 px-2 py-1`}>{conteudo}</div>}
          </li>
        );
      })}
    </ul>
  );
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

/**
 * Colunas por mês. Só o pico e o último mês levam o valor escrito; os demais
 * ficam na tabela abaixo e no tooltip. Os rótulos do eixo se espaçam conforme o número de meses.
 */
export function ColunasMensais({ meses }: { meses: { mes: string; n: number }[] }) {
  const maximo = Math.max(...meses.map((m) => m.n), 1);
  const pico = meses.reduce((a, m) => (m.n > a.n ? m : a), meses[0]);
  const ultimo = meses[meses.length - 1];
  // Rótulo de mês em no máximo uns seis pontos do eixo, qualquer que seja o número de meses.
  const passo = Math.max(Math.ceil(meses.length / 6), 1);
  const ALTURA = 120;
  return (
    <>
      <div>
        <div className="flex items-end gap-px border-b border-tinta-200 px-1 sm:gap-1"
             style={{ height: ALTURA + 20 }} role="img"
             aria-label={`Licenças por mês, de ${rotuloMes(meses[0].mes)} a ${rotuloMes(ultimo.mes)}. Pico: ${pico.n} em ${rotuloMes(pico.mes)}.`}>
          {meses.map((m, i) => {
            const rotulado = m.n > 0 && (m === pico || m === ultimo);
            return (
              <div key={m.mes} className="relative flex min-w-0 flex-1 flex-col items-center justify-end" style={{ maxWidth: 28 }}
                   title={`${rotuloMes(m.mes)}: ${m.n}`}>
                <span className="h-4 text-xs font-semibold text-tinta-800">{rotulado ? m.n : ''}</span>
                <span className="w-full max-w-6 rounded-t bg-marca-600"
                      style={{ height: Math.max((m.n / maximo) * ALTURA, m.n > 0 ? 3 : 0) }} />
                <span className="mt-1 h-4 w-0 whitespace-nowrap text-center text-xs text-tinta-500">
                  {i % passo === 0 ? <span className="relative -left-4 inline-block w-8">{rotuloMes(m.mes)}</span> : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-tinta-600 hover:text-tinta-900">Ver como tabela</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-tinta-200"><th className="py-1.5 pr-4 font-medium text-tinta-500">Mês</th><th className="py-1.5 text-right font-medium text-tinta-500">Licenças</th></tr></thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes} className="border-b border-tinta-100 last:border-0">
                  <td className="py-1.5 pr-4">{rotuloMes(m.mes)}</td><td className="tabular py-1.5 text-right">{m.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

/** Linhas verticais no início de cada mês da janela, com o nome do mês. */
function mesesDaJanela(janela: { de: string; ate: string }): { mes: string; pos: number }[] {
  const r: { mes: string; pos: number }[] = [];
  let [y, m] = janela.de.split('-').map(Number);
  for (;;) {
    const iso = `${y}-${String(m).padStart(2, '0')}-01`;
    if (iso > janela.ate) break;
    if (iso >= janela.de) r.push({ mes: iso.slice(0, 7), pos: posicaoNaJanela(iso, janela) });
    m++; if (m > 12) { m = 1; y++; }
  }
  return r;
}

/**
 * Linha do tempo das obras e serviços: uma barra por licença, do início ao fim
 * previstos, na cor da situação, com a marca de hoje. Cada linha abre a licença.
 */
export function LinhaDoTempo({ itens, janela, hoje }: {
  itens: ItemLinha[]; janela: { de: string; ate: string }; hoje: string;
}) {
  const meses = mesesDaJanela(janela);
  const presentes = [...new Set(itens.map((i) => i.estado))];
  const posHoje = posicaoNaJanela(hoje, janela);
  return (
    <>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <span />
            <div className="relative h-5">
              {meses.map((m) => (
                <span key={m.mes} className="absolute top-0 -translate-x-0 whitespace-nowrap pl-1 text-xs text-tinta-500" style={{ left: `${m.pos}%` }}>
                  {rotuloMes(m.mes)}
                </span>
              ))}
            </div>
          </div>
          <ul>
            {itens.map((i) => (
              <li key={i.id}>
                <Link to={`/obras/${i.id}`} className="group grid min-h-7 grid-cols-[7rem_1fr] items-center gap-3 hover:bg-tinta-50"
                      title={`${i.numero ?? i.processo}: ${dataBR(i.inicio)} a ${dataBR(i.fim)} (${ESTADO_LICENCA_LABEL[i.estado]})`}>
                  <span className="tabular truncate text-xs text-tinta-700 group-hover:underline">{i.numero ?? i.processo}</span>
                  <span className="relative h-7">
                    {meses.map((m) => <span key={m.mes} className="absolute inset-y-0 w-px bg-tinta-100" style={{ left: `${m.pos}%` }} />)}
                    {posHoje >= 0 && posHoje <= 100 && <span className="absolute inset-y-0 w-px bg-tinta-900" style={{ left: `${posHoje}%` }} />}
                    <span className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded ${COR_ESTADO[i.estado]}`}
                          style={{ left: `${i.esq}%`, width: `${Math.min(i.larg, 100 - i.esq)}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-tinta-600" aria-label="Legenda">
        {presentes.map((e) => (
          <li key={e} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-4 rounded ${COR_ESTADO[e]}`} aria-hidden />{ESTADO_LICENCA_LABEL[e]}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-px bg-tinta-900" aria-hidden />Hoje, {dataBR(hoje)}</li>
      </ul>
    </>
  );
}
