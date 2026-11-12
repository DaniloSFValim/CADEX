/** Cor das obras públicas sem licença no mapa (mesma do traço e do ponto). */
export const COR_OBRA_PUBLICA = '#7c3aed';

/**
 * Cartão da obra ou serviço sem licença selecionado no mapa. Fica no mesmo canto do cartão da
 * licença, com faixa colorida no topo para ser visto logo.
 */
export default function FichaIntervencao({ dados, onFechar }: {
  dados: Record<string, string>; onFechar: () => void;
}) {
  const publica = dados.categoria === 'publica';
  const cor = publica ? COR_OBRA_PUBLICA : '#eab308';
  const linhas: [string, string][] = [
    ['Executora', dados.empresa],
    ['Serviço', dados.servico],
    ['Local', dados.local],
    ['Período', dados.quando],
    ['Descrição', dados.descricao],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <article
      aria-label="Ficha da obra sem licença selecionada"
      className="absolute inset-x-3 bottom-3 z-10 overflow-hidden rounded-xl border-2 bg-white shadow-xl sm:inset-x-auto sm:left-3 sm:w-96"
      style={{ borderColor: cor }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-white" style={{ background: cor }}>
        <span className="text-sm font-extrabold uppercase tracking-wide">{dados.rotulo}</span>
        <button type="button" onClick={onFechar} className="rounded-md px-2 py-0.5 text-sm font-bold text-white/90 hover:bg-white/20">
          Fechar
        </button>
      </div>
      <dl className="grid gap-2 p-4 text-sm">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt className="text-xs font-semibold uppercase text-tinta-500">{rotulo}</dt>
            <dd className="text-tinta-900">{valor}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
