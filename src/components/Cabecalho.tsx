import type { ReactNode } from 'react';
import { FaixaMarca, type ItemMenu } from './FaixaMarca';

export type { ItemMenu };

/** Cabeçalho das páginas públicas: a mesma faixa de marca da área restrita. */
export function Cabecalho({ itens, direita }: { itens: ItemMenu[]; direita?: ReactNode }) {
  return <FaixaMarca itens={itens} direita={direita} />;
}

/** Menu das páginas abertas ao público. */
// A troca Empresas↔Obras é feita pelas abas (AbasConsulta); o menu do topo
// não a repete. O logo volta para a home (mapa).
export const MENU_PUBLICO: ItemMenu[] = [
  { rotulo: 'Área restrita', para: '/entrar' },
];
