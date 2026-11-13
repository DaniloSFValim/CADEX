import { useState } from 'react';
import { rotuloProcesso } from '../lib/licencas';

/** Cor das obras públicas sem licença no mapa (mesma do traço e do ponto). */
export const COR_OBRA_PUBLICA = '#7c3aed';

/** Só https: o link das fotos vem do cadastro e vai para uma imagem de outro site. */
function fotoSegura(url: string | undefined): string | null {
  return url && /^https:\/\/\S+$/.test(url) ? url : null;
}

/**
 * Cartão da obra ou serviço sem licença selecionado no mapa. Fica no mesmo canto do cartão da
 * licença, com faixa colorida no topo, os números de transparência e a prévia das fotos.
 */
export default function FichaIntervencao({ dados, onFechar }: {
  dados: Record<string, string>; onFechar: () => void;
}) {
  const publica = dados.categoria === 'publica';
  const cor = publica ? COR_OBRA_PUBLICA : '#eab308';
  const foto = fotoSegura(dados.foto_url);
  const [fotoFalhou, setFotoFalhou] = useState(false);
  const processo = dados.processo;
  const linhas: [string, string][] = [
    ['Tipo', dados.tipo],
    ['Setor', dados.setor],
    ['Situação', dados.situacao],
    ['Executora', dados.empresa],
    ['Serviço', dados.servico],
    ['Local', dados.local],
    ['Período', dados.quando],
    [processo ? rotuloProcesso(processo) : 'Processo', processo],
    ['Processo administrativo', dados.processo_administrativo],
    ['Contrato', dados.contrato],
    ['Ordem de serviço', dados.ordem_servico],
    ['Descrição', dados.descricao],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <article
      aria-label="Ficha da obra sem licença selecionada"
      className="absolute inset-x-3 bottom-3 z-10 max-h-[80%] overflow-y-auto rounded-xl border-2 bg-white shadow-xl sm:inset-x-auto sm:left-3 sm:w-96"
      style={{ borderColor: cor }}
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 px-4 py-2.5 text-white" style={{ background: cor }}>
        <span className="text-sm font-extrabold uppercase tracking-wide">{dados.rotulo}</span>
        <button type="button" onClick={onFechar} className="rounded-md px-2 py-0.5 text-sm font-bold text-white/90 hover:bg-white/20">
          Fechar
        </button>
      </div>
      {foto && !fotoFalhou && (
        <figure className="border-b border-tinta-200 bg-tinta-100">
          <a href={foto} target="_blank" rel="noopener noreferrer" aria-label="Abrir as fotos da obra" className="block">
            <img src={foto} alt="Prévia das fotos da obra" loading="lazy" referrerPolicy="no-referrer"
                 className="aspect-video w-full object-cover" onError={() => setFotoFalhou(true)} />
          </a>
          <figcaption className="flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold text-tinta-700">
            <span>Fotos da obra</span>
            <a href={foto} target="_blank" rel="noopener noreferrer" className="text-marca-700 hover:underline">Abrir o álbum</a>
          </figcaption>
        </figure>
      )}
      <dl className="grid gap-2 p-4 text-sm">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt className="text-xs font-semibold uppercase text-tinta-500">{rotulo}</dt>
            <dd className="text-tinta-900">{valor}</dd>
          </div>
        ))}
      </dl>
      {dados.licenca_codigo && (
        <div className="flex flex-wrap gap-4 border-t border-tinta-200 px-4 py-3 text-sm font-semibold">
          <a href={`/licenca/${dados.licenca_codigo}`} className="text-marca-700 hover:underline">Ver a licença</a>
        </div>
      )}
    </article>
  );
}
