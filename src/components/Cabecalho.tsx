import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

export interface ItemMenu { rotulo: string; para: string; fim?: boolean }

/**
 * Cabeçalho no desenho do NETRANK RJ: barra branca fixa, nome do sistema à
 * esquerda (com o logotipo oficial, menor), menu em seguida e, à direita,
 * quem está conectado. O item ativo fica numa caixa contornada.
 */
export function Cabecalho({ itens, direita }: { itens: ItemMenu[]; direita?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-tinta-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link to="/consulta" className="flex items-center gap-3" title="CADEX, Cadastro de Executores">
          <img
            src="/logo-prefeitura-seconser.png"
            alt="Prefeitura de Niterói, SECONSER"
            width={896}
            height={273}
            className="h-7 w-auto sm:h-8"
          />
          <span className="text-lg font-bold tracking-[-0.01em] text-tinta-900">CADEX</span>
        </Link>

        <nav className="order-3 -mx-1 w-full overflow-x-auto md:order-0 md:mx-0 md:w-auto md:overflow-visible"
             aria-label="Menu principal">
          <ul className="flex gap-1 whitespace-nowrap">
            {itens.map((i) => (
              <li key={i.para}>
                <NavLink
                  to={i.para}
                  end={i.fim}
                  className={({ isActive }) =>
                    `inline-flex min-h-10 items-center rounded px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'text-tinta-900 ring-1 ring-inset ring-marca-500'
                        : 'text-tinta-600 hover:bg-tinta-50 hover:text-tinta-900'}`}
                >
                  {i.rotulo}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {direita && <div className="ml-auto flex items-center gap-3 text-sm">{direita}</div>}
      </div>
    </header>
  );
}

/** Menu das páginas abertas ao público. */
export const MENU_PUBLICO: ItemMenu[] = [
  { rotulo: 'Consulta pública', para: '/consulta' },
  { rotulo: 'Área restrita', para: '/', fim: true },
];
