import { Link } from 'react-router-dom';
import { COR_SITUACAO, SITUACAO_PUBLICA_LABEL, type ObraPublica } from '../lib/obras';

/**
 * Resumo da obra selecionada, sobre o mapa. Não repete o que a lista ao lado mostra
 * (executora, período, bairro, número): quem quiser os detalhes usa "Ver na lista" ou "Ver licença".
 */
export default function FichaObra({ obra, onFechar }: { obra: ObraPublica; onFechar: () => void }) {
  const cor = COR_SITUACAO[obra.situacao];
  const t = obra.trechos[0];
  const extras = obra.trechos.length - 1;
  const verNaLista = () => document.getElementById(`obra-${obra.codigo}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return (
    <article
      aria-label="Ficha da obra selecionada"
      className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-tinta-200 bg-white p-4 shadow-lg sm:inset-x-auto sm:left-3 sm:w-96"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: cor }}>
          <span className="h-2 w-2 rounded-full" style={{ background: cor }} aria-hidden />
          {SITUACAO_PUBLICA_LABEL[obra.situacao]}
        </span>
        <button type="button" onClick={onFechar} className="text-sm font-semibold text-tinta-500 hover:text-tinta-900">
          Fechar
        </button>
      </div>
      <h3 className="mt-2 font-display text-lg font-bold leading-snug text-tinta-900">
        {t?.logradouro ?? 'Local não informado'}
      </h3>
      {extras > 0 && <p className="text-xs text-tinta-500">e mais {extras} {extras === 1 ? 'trecho' : 'trechos'}</p>}
      <p className="mt-1 line-clamp-2 text-sm text-tinta-700">{obra.escopo}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold">
        <Link to={`/licenca/${obra.codigo}`} className="text-marca-600 hover:underline">
          Ver licença <span className="font-normal text-tinta-500">nº {obra.numero}</span>
        </Link>
        <button type="button" onClick={verNaLista} className="text-marca-600 hover:underline">Ver na lista</button>
      </div>
    </article>
  );
}
