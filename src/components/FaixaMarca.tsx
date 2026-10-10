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
    <header className="relative overflow-hidden bg-gradient-to-br from-marca-900 to-marca-600 text-white">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-obra-500/20" />
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-3 px-4 pt-4 lg:px-10">
        <Link to="/consulta/obras" className="flex items-center gap-3" title="CADEX, Cadastro de Executores">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-obra-500 font-display text-base font-extrabold text-tinta-900">CX</span>
          <span className="leading-tight">
            <span className="block font-display text-xl font-extrabold tracking-wide">CADEX</span>
            <span className="block text-xs text-white/75">Prefeitura de Niterói · SECONSER</span>
          </span>
        </Link>

        {direita && <div className="ml-auto flex items-center gap-3 text-sm">{direita}</div>}

        <nav className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto pb-4 lg:-mx-10 lg:w-[calc(100%+5rem)]" aria-label="Menu principal">
          <ul className="flex w-max gap-2 px-4 lg:px-10">
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
        </nav>
      </div>
    </header>
  );
}
