import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

export interface ItemMenu { rotulo: string; para: string; fim?: boolean }

/**
 * Cabeçalho fixo no topo, no mesmo desenho do NETRANK RJ: identificação à
 * esquerda (logotipo oficial fornecido pela SECONSER e nome do sistema),
 * menu em seguida e, à direita, quem está conectado.
 */
export function Cabecalho({ itens, direita }: { itens: ItemMenu[]; direita?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-tinta-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
        <Link to="/consulta" className="flex items-center gap-3.5">
          <img
            src="/logo-prefeitura-seconser.png"
            alt="Prefeitura de Niterói, SECONSER"
            width={896}
            height={273}
            className="h-9 w-auto sm:h-11"
          />
          <span className="h-8 w-px bg-tinta-200" aria-hidden />
          <span className="leading-tight">
            <span className="block text-lg font-bold tracking-[-0.01em] text-tinta-900">CADEX</span>
            <span className="block text-xs text-tinta-400">Cadastro de Executores</span>
          </span>
        </Link>

        <nav className="order-3 -mx-1 w-full overflow-x-auto md:order-none md:mx-0 md:w-auto md:overflow-visible"
             aria-label="Menu principal">
          <ul className="flex gap-1 whitespace-nowrap">
            {itens.map((i) => (
              <li key={i.para}>
                <NavLink
                  to={i.para}
                  end={i.fim}
                  className={({ isActive }) =>
                    `inline-flex min-h-10 items-center rounded px-3 text-sm transition-colors ${
                      isActive
                        ? 'bg-marca-50 font-semibold text-marca-700'
                        : 'text-tinta-500 hover:bg-tinta-50 hover:text-tinta-900'}`}
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
