import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

export interface ItemMenu { rotulo: string; para: string; fim?: boolean }

/**
 * Faixa de marca única do sistema: a mesma nas áreas pública e restrita.
 * Identidade à esquerda, menu em pílulas e, à direita, o que estiver
 * conectado (ou o link para a área restrita). Em telas estreitas, o menu
 * rola na horizontal.
 */
export function FaixaMarca({ itens, direita }: { itens: ItemMenu[]; direita?: ReactNode }) {
  return (
    <>
    <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-marca-800 focus:shadow-md">
      Pular para o conteúdo
    </a>
    <header className="relative overflow-hidden bg-gradient-to-br from-marca-900 to-marca-600 text-white">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-obra-500/20" />
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-3 px-4 pt-4">
        <Link to="/consulta/obras" className="flex items-center gap-3" title="CADEX, Cadastro de Executores">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-obra-500 font-display text-base font-extrabold text-tinta-900">CX</span>
          <span className="leading-tight">
            <span className="block font-display text-xl font-extrabold tracking-wide">CADEX</span>
            <span className="block text-xs text-white/75">Prefeitura de Niterói · SECONSER</span>
            <span className="block text-xs text-white/75">Fiscalização de Serviços Concedidos</span>
          </span>
        </Link>

        {direita && <div className="ml-auto flex items-center gap-3 text-sm">{direita}</div>}

        {itens.length > 0 && <nav className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto pb-4" aria-label="Menu principal">
          <ul className="flex w-max gap-2 px-4">
            {itens.map((i) => (
              <li key={i.para}>
                <NavLink
                  to={i.para}
                  end={i.fim}
                  className={({ isActive }) =>
                    `inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
                      isActive ? 'bg-white text-marca-900' : 'bg-white/12 text-white hover:bg-white/20'}`}
                >
                  {i.rotulo}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>}
      </div>
    </header>
    </>
  );
}
