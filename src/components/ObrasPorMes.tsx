import { useState } from 'react';
import { COR_SITUACAO, SITUACAO_PUBLICA_LABEL, barraNoAno, obrasNoMes, type ObraPublica } from '../lib/obras';
import type { SituacaoPublica } from '../lib/licencas';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
/** Ordem da pilha, de baixo para cima: o que está em andamento fica na base. */
const ORDEM: SituacaoPublica[] = ['vigente', 'aguardando_inicio', 'prazo_encerrado', 'concluida', 'suspensa', 'cancelada'];
/** Quantas obras a lista do mês mostra; o resto fica na lista geral, abaixo. */
const MAX_LISTA = 10;
/** Altura, em pixels, da coluna do mês com mais obras. Fixa para as barras não depender da altura do pai. */
const ALTURA_BARRA = 112;

/**
 * Obras por mês do ano: uma coluna por mês, empilhada por situação. O mês de hoje
 * fica marcado. Clicar numa coluna lista as obras daquele mês; clicar numa obra
 * abre a ficha dela.
 */
export default function ObrasPorMes({ obras, ano, hoje, foco, onSelecionar }: {
  obras: ObraPublica[]; ano: number; hoje: string; foco: string | null; onSelecionar: (codigo: string) => void;
}) {
  const meses = obrasNoMes(obras, ano);
  const mesHoje = hoje.startsWith(String(ano)) ? Number(hoje.slice(5, 7)) - 1 : -1;
  const [mesEscolhido, setMesEscolhido] = useState(mesHoje >= 0 ? mesHoje : 0);
  const comPeriodo = obras.filter((o) => barraNoAno(o, ano) !== null).length;
  const maximo = Math.max(1, ...meses.map((m) => m.obras.length));
  const media = meses.reduce((soma, m) => soma + m.obras.length, 0) / meses.length;
  const pico = Math.max(...meses.map((m) => m.obras.length));
  const escolhido = meses[mesEscolhido];

  return (
    <section aria-label="Obras por mês do ano" className="rounded-xl border border-tinta-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-tinta-100 px-4 py-3">
        <h2 className="font-display text-base font-bold text-tinta-900">Obras em {ano}</h2>
        <span className="text-xs text-tinta-500">
          {comPeriodo === 0 ? 'Nenhuma obra com período neste ano' : `${comPeriodo} com período neste ano`}
        </span>
      </div>

      {comPeriodo > 0 && (
        <div className="px-4 pb-4 pt-4">
          <div className="relative flex h-44 items-end gap-1.5 sm:gap-3" role="group" aria-label="Colunas por mês">
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-tinta-900/40" style={{ bottom: `${(media / maximo) * ALTURA_BARRA}px` }} aria-hidden>
              <span className="absolute right-0 -top-4 text-xs text-tinta-600">média {media.toFixed(1).replace('.', ',')}</span>
            </div>
            {meses.map((m) => {
              const total = m.obras.length;
              const ativo = m.mes === mesEscolhido;
              const resumo = ORDEM.filter((s) => m.porSituacao[s])
                .map((s) => `${m.porSituacao[s]} ${SITUACAO_PUBLICA_LABEL[s].toLowerCase()}`).join(', ');
              return (
                <button
                  key={m.mes}
                  type="button"
                  aria-pressed={ativo}
                  aria-label={`${MESES[m.mes]}: ${total} ${total === 1 ? 'obra' : 'obras'}${resumo ? `, ${resumo}` : ''}`}
                  onClick={() => setMesEscolhido(m.mes)}
                  className={`flex h-full min-w-0 flex-1 flex-col items-stretch justify-end rounded-sm transition-opacity hover:opacity-80 ${
                    ativo ? 'ring-2 ring-tinta-900 ring-offset-1' : ''}`}
                >
                  <span className={`tabular mb-1 text-center text-xs ${total === pico && total > 0 ? 'font-bold text-tinta-900' : 'font-semibold text-tinta-700'}`} aria-hidden>
                    {total > 0 ? total : ''}
                  </span>
                  <span className={`flex flex-col-reverse overflow-hidden rounded-t-sm ${m.mes === mesHoje ? 'ring-1 ring-tinta-900' : ''}`} style={{ height: `${(total / maximo) * ALTURA_BARRA}px` }} aria-hidden>
                    {ORDEM.filter((s) => m.porSituacao[s]).map((s) => (
                      <span key={s} style={{ height: `${((m.porSituacao[s] ?? 0) / total) * 100}%`, background: COR_SITUACAO[s] }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1.5 sm:gap-3" aria-hidden>
            {MESES.map((nome, i) => (
              <span key={nome} className={`min-w-0 flex-1 text-center text-xs ${
                i === mesHoje ? 'font-bold text-tinta-900' : 'text-tinta-500'}`}>
                {nome}
                {i === mesHoje && <span className="block text-xs font-semibold text-tinta-900">hoje</span>}
              </span>
            ))}
          </div>

          <div className="mt-5 border-t border-tinta-100 pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-tinta-900">
                {MESES[mesEscolhido]} de {ano}: {escolhido.obras.length} {escolhido.obras.length === 1 ? 'obra' : 'obras'}
              </p>
              <ul className="flex flex-wrap gap-3 text-xs text-tinta-600">
                {ORDEM.filter((s) => escolhido.porSituacao[s]).map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_SITUACAO[s] }} aria-hidden />
                    {SITUACAO_PUBLICA_LABEL[s]} {escolhido.porSituacao[s]}
                  </li>
                ))}
              </ul>
            </div>
            {escolhido.obras.length > 0 && (
              <ul className="mt-3 divide-y divide-tinta-100">
                {escolhido.obras.slice(0, MAX_LISTA).map((o) => (
                  <li key={o.codigo}>
                    <button
                      type="button"
                      onClick={() => onSelecionar(o.codigo)}
                      aria-pressed={foco === o.codigo}
                      className={`flex w-full min-w-0 items-center gap-3 py-2 text-left text-sm hover:bg-tinta-50 ${
                        foco === o.codigo ? 'font-semibold text-tinta-900' : 'text-tinta-700'}`}
                    >
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
            {escolhido.obras.length > MAX_LISTA && (
              <p className="mt-2 text-xs text-tinta-500">
                Mostrando {MAX_LISTA} de {escolhido.obras.length}. As demais estão na lista abaixo.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
