import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FaixaMarca, type ItemMenu } from './FaixaMarca';

export type { ItemMenu };

/** Entrada da área restrita, no canto superior direito das páginas públicas. */
const AREA_RESTRITA = (
  <Link to="/entrar" className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-white/12 px-4 text-sm font-semibold text-white hover:bg-white/20">
    Área restrita
  </Link>
);

/** Cabeçalho das páginas públicas: a mesma faixa de marca da área restrita. */
export function Cabecalho({ itens = [], direita = AREA_RESTRITA }: { itens?: ItemMenu[]; direita?: ReactNode }) {
  return <FaixaMarca itens={itens} direita={direita} />;
}
