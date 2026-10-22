import { useMemo, useState, type KeyboardEvent } from 'react';
import { COR_SITUACAO, SITUACAO_PUBLICA_LABEL, contarMeses, mesesDoPeriodo, type ObraPublica } from '../lib/obras';
import type { SituacaoPublica } from '../lib/licencas';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Ordem da pilha, de baixo para cima: o que está em andamento fica na base. */
const ORDEM: SituacaoPublica[] = ['vigente', 'aguardando_inicio', 'prazo_encerrado', 'concluida', 'cancelada'];
/** Quantas obras a lista do mês mostra; o resto fica na lista geral, abaixo. */
const MAX_LISTA = 10;
const LARGURA = 720;
const ALTURA = 220;
const TOPO = 28;
const BASE = 200;

/**
 * Obras ativas ao longo do tempo: área empilhada por situação, do primeiro ao último mês
 * dos períodos das obras, sem recorte de ano. A linha marca o mês de hoje. Clicar num mês
 * lista as obras que ele cobre; clicar numa obra abre a ficha.
 */
export default function ObrasNoTempo({ obras, hoje, foco, onSelecionar }: {
  obras: ObraPublica[]; hoje: string; foco: string | null; onSelecionar: (codigo: string) => void;
}) {
  const meses = useMemo(() => contarMeses(obras, mesesDoPeriodo(obras)), [obras]);
  const hojeAno = Number(hoje.slice(0, 4));
  const hojeMes = Number(hoje.slice(5, 7)) - 1;
  const indiceHoje = meses.findIndex((m) => m.ano === hojeAno && m.mes === hojeMes);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const atual = escolhido ?? (indiceHoje >= 0 ? indiceHoje : meses.length - 1);

  if (meses.length === 0) {
    return (
      <section aria-label="Obras ao longo do tempo" className="rounded-xl border border-tinta-200 bg-white shadow-xs">
        <div className="px-4 py-3"><h2 className="font-display text-base font-bold text-tinta-900">Obras ao longo do tempo</h2></div>
        <p className="border-t border-tinta-100 px-4 py-6 text-sm text-tinta-600">Nenhuma obra com período informado.</p>
      </section>
    );
  }

  const n = meses.length;
  const largura = LARGURA / n;
  const maximo = Math.max(1, ...meses.map((m) => m.obras.length));
  const X = (i: number) => (i + 0.5) * largura;
  const Y = (v: number) => BASE - (v / maximo) * (BASE - TOPO);
  const mes = meses[atual];
  const comPeriodo = obras.filter((o) => !!o.inicio_previsto && !!o.fim_previsto).length;

  // Pilha: cada situação ocupa a faixa entre a soma das de baixo e a soma com ela.
  const camadas: { situacao: SituacaoPublica; pontos: string }[] = [];
  const acumulado = new Array<number>(n).fill(0);
  for (const s of ORDEM) {
    if (!meses.some((m) => m.porSituacao[s])) continue;
    const abaixo = acumulado.slice();
    meses.forEach((m, i) => { acumulado[i] += m.porSituacao[s] ?? 0; });
    const topo = acumulado.map((v, i) => `${X(i)},${Y(v)}`);
    const fundo = abaixo.map((v, i) => `${X(i)},${Y(v)}`).reverse();
    camadas.push({ situacao: s, pontos: [...topo, ...fundo].join(' ') });
  }

  const passo = Math.max(1, Math.ceil(n / 8));
  const aoTeclar = (e: KeyboardEvent<SVGGElement>, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEscolhido(i); }
  };

  return (
    <section aria-label="Obras ao longo do tempo" className="rounded-xl border border-tinta-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-tinta-100 px-4 py-3">
        <h2 className="font-display text-base font-bold text-tinta-900">Obras ao longo do tempo</h2>
        <span className="text-xs text-tinta-500">{comPeriodo} com período · de {MESES[meses[0].mes]} de {meses[0].ano} a {MESES[meses[n - 1].mes]} de {meses[n - 1].ano}</span>
      </div>

      <div className="px-4 pb-4 pt-4">
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img"
             aria-label={`Obras ativas por mês, de ${MESES[meses[0].mes]} de ${meses[0].ano} a ${MESES[meses[n - 1].mes]} de ${meses[n - 1].ano}`}
             className="block h-auto w-full overflow-visible">
          <rect x={X(atual) - largura / 2} y={0} width={largura} height={BASE} fill="var(--fio, #e5e7eb)" opacity={0.6} />
          {camadas.map((c) => (
            <polygon key={c.situacao} points={c.pontos} fill={COR_SITUACAO[c.situacao]} opacity={0.92} />
          ))}
          <line x1={0} x2={LARGURA} y1={BASE} y2={BASE} stroke="var(--fio, #e5e7eb)" />
          {indiceHoje >= 0 && (
            <line x1={X(indiceHoje)} x2={X(indiceHoje)} y1={TOPO - 12} y2={BASE} stroke="currentColor" strokeDasharray="3 3" className="text-tinta-900" />
          )}
          {meses.map((m, i) => (
            <g key={`${m.ano}-${m.mes}`} role="button" tabIndex={0} aria-pressed={i === atual}
               aria-label={`${MESES_LONGOS[m.mes]} de ${m.ano}: ${m.obras.length} ${m.obras.length === 1 ? 'obra' : 'obras'}`}
               onClick={() => setEscolhido(i)} onKeyDown={(e) => aoTeclar(e, i)} className="cursor-pointer outline-none">
              <rect x={i * largura} y={0} width={largura} height={ALTURA} fill="transparent" stroke={i === atual ? 'currentColor' : 'none'} strokeWidth={1.5} className="text-tinta-900" />
            </g>
          ))}
          {meses.map((m, i) => (i % passo === 0 || i === n - 1) && (
            <text key={`r-${i}`} x={X(i)} y={BASE + 16} textAnchor="middle" className="fill-tinta-500 text-[11px]">
              {MESES[m.mes]}{m.mes === 0 || i === 0 ? ` ${m.ano}` : ''}
            </text>
          ))}
          {indiceHoje >= 0 && (
            <text x={X(indiceHoje)} y={TOPO - 16} textAnchor="middle" className="fill-tinta-900 text-[11px] font-semibold">hoje</text>
          )}
        </svg>

        <div className="mt-5 border-t border-tinta-100 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-tinta-900">
              {MESES_LONGOS[mes.mes]} de {mes.ano}: {mes.obras.length} {mes.obras.length === 1 ? 'obra' : 'obras'}
            </p>
            <ul className="flex flex-wrap gap-3 text-xs text-tinta-600">
              {ORDEM.filter((s) => mes.porSituacao[s]).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_SITUACAO[s] }} aria-hidden />
                  {SITUACAO_PUBLICA_LABEL[s]} {mes.porSituacao[s]}
                </li>
              ))}
            </ul>
          </div>
          {mes.obras.length > 0 && (
            <ul className="mt-3 divide-y divide-tinta-100">
              {mes.obras.slice(0, MAX_LISTA).map((o) => (
                <li key={o.codigo}>
                  <button type="button" onClick={() => onSelecionar(o.codigo)} aria-pressed={foco === o.codigo}
                          className={`flex w-full min-w-0 items-center gap-3 py-2 text-left text-sm hover:bg-tinta-50 ${
                            foco === o.codigo ? 'font-semibold text-tinta-900' : 'text-tinta-700'}`}>
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: COR_SITUACAO[o.situacao] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {o.trechos[0]?.logradouro ?? 'Obra'}
                      {o.trechos[0]?.bairro ? <span className="text-tinta-500"> · {o.trechos[0].bairro}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-tinta-500">{o.inicio_previsto} a {o.fim_previsto}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mes.obras.length > MAX_LISTA && (
            <p className="mt-2 text-xs text-tinta-500">Mostrando {MAX_LISTA} de {mes.obras.length}. As demais estão na lista abaixo.</p>
          )}
        </div>
      </div>
    </section>
  );
}
