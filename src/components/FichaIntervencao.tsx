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
      className="absolute inset-x-3 bottom-3 z-10 max-h-[80%] overflow-y-auto rounded-xl border-2 bg-white shadow-xl sm:inset-x-auto sm:left-3 sm:w-96"
      style={{ borderColor: cor }}
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 px-4 py-2.5 text-white" style={{ background: cor }}>
        <span className="text-sm font-extrabold uppercase tracking-wide">{dados.rotulo}</span>
        <button type="button" onClick={onFechar} className="rounded-md px-2 py-0.5 text-sm font-bold text-white/90 hover:bg-white/20">
          Fechar
        </button>
      </div>
      {visiveis.length > 0 && (
        <section className="border-b border-tinta-200 bg-tinta-50 p-3" aria-label="Galeria de fotos da obra">
          <div className="mb-2 text-xs font-semibold uppercase text-tinta-600">Fotos da obra ({visiveis.length})</div>
          <div className="grid grid-cols-3 gap-1.5">
            {visiveis.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md bg-tinta-100">
                <img src={url} alt="Foto da obra" loading="lazy" referrerPolicy="no-referrer"
                     className="aspect-square w-full object-cover"
                     onError={() => setFalhas((antes) => new Set(antes).add(url))} />
              </a>
            ))}
          </div>
        </section>
      )}
      <dl className="grid gap-2 p-4 text-sm">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt className="text-xs font-semibold uppercase text-tinta-500">{rotulo}</dt>
            <dd className="text-tinta-900">{valor}</dd>
          </div>
        ))}
      </dl>
      {(pasta || dados.licenca_codigo) && (
        <div className="flex flex-wrap gap-4 border-t border-tinta-200 px-4 py-3 text-sm font-semibold">
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
