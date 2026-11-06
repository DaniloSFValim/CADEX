import { Link } from 'react-router-dom';
import { COR_SITUACAO, SITUACAO_PUBLICA_LABEL, type ObraPublica } from '../lib/obras';
import { ORIGEM_LABEL, TIPO_INTERVENCAO_LABEL, origemPublica } from '../lib/licencas';
import { dataBR } from './Situacao';

/** Ficha da obra selecionada no mapa: fica sobre o mapa, sem cobrir a lista. */
export default function FichaObra({ obra, onFechar }: { obra: ObraPublica; onFechar: () => void }) {
  const cor = COR_SITUACAO[obra.situacao];
  const t = obra.trechos[0];
  const extras = obra.trechos.length - 1;
  return (
    <article
      aria-label="Ficha da obra selecionada"
      className="absolute inset-x-3 bottom-3 z-10 max-h-[70%] overflow-y-auto rounded-xl border border-tinta-200 bg-white p-4 shadow-lg sm:inset-x-auto sm:left-3 sm:w-96"
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
      <p className="mt-1 text-sm text-tinta-700">{obra.escopo}</p>
      <dl className="mt-3 grid gap-1.5 text-sm">
        <div className="flex gap-2"><dt className="w-28 flex-none text-tinta-500">Bairro</dt><dd>{t?.bairro?.trim() || 'Não informado'}</dd></div>
        <div className="flex gap-2"><dt className="w-28 flex-none text-tinta-500">Tipo</dt>
          <dd>{TIPO_INTERVENCAO_LABEL[obra.tipo_intervencao]}{origemPublica(obra.origem) && `, pública · ${ORIGEM_LABEL[obra.origem].toLowerCase()}`}</dd></div>
        <div className="flex gap-2"><dt className="w-28 flex-none text-tinta-500">Executora</dt><dd>{obra.executora}</dd></div>
        {obra.contratante && <div className="flex gap-2"><dt className="w-28 flex-none text-tinta-500">Contratante</dt><dd>{obra.contratante}</dd></div>}
        <div className="flex gap-2"><dt className="w-28 flex-none text-tinta-500">Início previsto</dt>
          <dd className="tabular">{obra.inicio_previsto ? dataBR(obra.inicio_previsto) : 'Não informado'}</dd></div>
        <div className="flex gap-2"><dt className="w-28 flex-none text-tinta-500">Término previsto</dt>
          <dd className="tabular">{obra.fim_previsto ? dataBR(obra.fim_previsto) : 'Não informado'}</dd></div>
      </dl>
      <Link to={`/licenca/${obra.codigo}`} className="mt-3 inline-block text-sm font-semibold text-marca-600 hover:underline">
        Ver licença <span className="font-normal text-tinta-500">nº {obra.numero}</span>
      </Link>
    </article>
  );
}
