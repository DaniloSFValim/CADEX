import { useState } from 'react';
import { rotuloProcesso } from '../lib/licencas';

/** Cor das obras públicas sem licença no mapa (mesma do traço e do ponto). */
export const COR_OBRA_PUBLICA = '#7c3aed';

/** Lista de imagens (JSON) do cadastro: só links https, até 12. */
function lerFotos(texto: string | undefined): string[] {
  try {
    const v: unknown = JSON.parse(texto || '[]');
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && /^https:\/\/\S+$/.test(u)).slice(0, 12) : [];
  } catch {
    return [];
  }
}

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
  const pasta = fotoSegura(dados.foto_url);
  const fotos = lerFotos(dados.fotos);
  const [falhas, setFalhas] = useState<Set<string>>(() => new Set());
  const visiveis = fotos.filter((u) => !falhas.has(u));
  const processo = dados.processo;
  const linhas: [string, string][] = [
    ['Tipo', dados.tipo],
    ['Setor', dados.setor],
    ['Situação', dados.situacao],
    ['Contratante', dados.contratante],
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
      className="absolute inset-x-2 bottom-2 z-10 overflow-hidden rounded-lg border-2 bg-white text-xs shadow-lg sm:inset-x-auto sm:bottom-3 sm:left-3 sm:w-[min(52rem,calc(100%-1.5rem))]"
      style={{ borderColor: cor }}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-white" style={{ background: cor }}>
        <span className="text-[11px] font-extrabold uppercase tracking-wide">{dados.rotulo}</span>
        <button type="button" onClick={onFechar} className="rounded px-2 py-0.5 text-xs font-bold text-white/90 hover:bg-white/20">
          Fechar
        </button>
      </div>
      <div className="flex flex-col md:flex-row">
        {visiveis.length > 0 && (
          <section className="shrink-0 border-b border-tinta-200 bg-tinta-50 p-2 md:w-40 md:border-b-0 md:border-r" aria-label="Galeria de fotos da obra">
            <div className="mb-1 text-[10px] font-semibold uppercase text-tinta-600">Fotos ({visiveis.length})</div>
            <div className="grid grid-cols-4 gap-1 md:grid-cols-3">
              {visiveis.map((url) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded bg-tinta-100">
                  <img src={url} alt="Foto da obra" loading="lazy" referrerPolicy="no-referrer"
                       className="aspect-square w-full object-cover"
                       onError={() => setFalhas((antes) => new Set(antes).add(url))} />
                </a>
              ))}
            </div>
          </section>
        )}
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1.5 p-3 lg:grid-cols-4">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className={rotulo === 'Serviço' || rotulo === 'Descrição' || rotulo === 'Local' ? 'col-span-2 lg:col-span-4' : ''}>
              <dt className="text-[10px] font-semibold uppercase text-tinta-500">{rotulo}</dt>
              <dd className="leading-snug text-tinta-900 [overflow-wrap:anywhere]">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
      {(pasta || dados.licenca_codigo) && (
        <div className="flex flex-wrap gap-4 border-t border-tinta-200 px-3 py-1.5 text-xs font-semibold">
          {pasta && (
            <a href={pasta} target="_blank" rel="noopener noreferrer" className="text-marca-700 hover:underline">Mais fotos</a>
          )}
          {dados.licenca_codigo && (
            <a href={`/licenca/${dados.licenca_codigo}`} className="text-marca-700 hover:underline">Ver a licença</a>
          )}
        </div>
      )}
    </article>
  );
}
