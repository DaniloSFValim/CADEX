import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

export interface ItemMenu { rotulo: string; para: string; fim?: boolean }

/**
 * Faixa de marca única do sistema: a mesma nas áreas pública e restrita.
 * Identidade à esquerda, menu de abas retas e, à direita, o que estiver
 * conectado (ou o link para a área restrita). Em telas estreitas, o menu
 * rola na horizontal.
 */
export function FaixaMarca({ itens, direita }: { itens: ItemMenu[]; direita?: ReactNode }) {
  return (
    <header className="border-b border-tinta-200 bg-white text-tinta-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-4 lg:px-10">
        <Link to="/consulta" className="flex items-center gap-4" title="Cadastro de Executores (CADEX)">
          <img src="/logo-prefeitura-seconser.png" alt="Prefeitura de Niterói, SECONSER" className="h-11 w-auto" />
          <span className="hidden border-l border-tinta-200 pl-4 leading-tight sm:block">
            <span className="block text-base font-bold tracking-tight">CADEX</span>
            <span className="block text-sm text-tinta-500">Cadastro de Executores</span>
          </span>
        </Link>

        {direita && <div className="ml-auto flex items-center gap-3 text-sm text-tinta-600">{direita}</div>}

        <nav className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto pb-3 lg:mx-0 lg:w-full" aria-label="Menu principal">
          <ul className="flex w-max gap-2 px-4 lg:px-0">
            {itens.map((i) => (
              <li key={i.para}>
                <NavLink
                  to={i.para}
                  end={i.fim}
                  className={({ isActive }) =>
                    `inline-flex min-h-10 items-center whitespace-nowrap rounded-sm px-4 text-sm font-semibold transition-colors ${
                      isActive ? 'bg-marca-600 text-white' : 'text-tinta-700 hover:bg-tinta-100'}`}
                >
                  {i.rotulo}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
