import { useEffect, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Em faixas de abas que rolam na horizontal (celular), traz a aba ativa para o meio da faixa
 * a cada troca de página. Mexe só na rolagem horizontal da faixa: a página não pula.
 */
export function useAbaAtivaVisivel(faixa: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  useEffect(() => {
    const c = faixa.current;
    const a = c?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!c || !a || c.scrollWidth <= c.clientWidth) return;
    const rc = c.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    c.scrollLeft += ra.left - rc.left - (rc.width - ra.width) / 2;
  }, [faixa, pathname]);
}
