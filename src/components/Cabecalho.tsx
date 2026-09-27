import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

export interface ItemMenu { rotulo: string; para: string; fim?: boolean }

const SITE_SECONSER = 'https://www.seconser.niteroi.rj.gov.br/';

/**
 * Barra do governo, identificação (logotipo oficial fornecido pela SECONSER:
 * public/logo-prefeitura-seconser.png) e menu do sistema.
 */
export function Cabecalho({ itens, direita }: { itens: ItemMenu[]; direita?: ReactNode }) {
  return (
    <header>
      <div className="bg-tinta-900 text-2xs text-tinta-300">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1.5">
          <span>
            Prefeitura Municipal de Niterói
            <span className="hidden sm:inline"> · Secretaria de Conservação e Serviços Públicos</span>
          </span>
          <a href={SITE_SECONSER} target="_blank" rel="noopener noreferrer"
             className="hidden shrink-0 hover:text-white sm:inline">
            Portal da SECONSER
          </a>
        </div>
      </div>

      <div className="border-b border-tinta-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <Link to="/consulta" className="flex items-center gap-4">
            <img
              src="/logo-prefeitura-seconser.png"
              alt="Prefeitura de Niterói, SECONSER"
              width={896}
              height={273}
              className="h-11 w-auto sm:h-14"
            />
            <span className="hidden h-10 w-px bg-tinta-200 sm:block" aria-hidden />
            <span className="leading-tight">
              <span className="block text-base font-bold tracking-wide text-tinta-900">CADEX</span>
              <span className="block text-xs text-tinta-500">Cadastro de Executores</span>
            </span>
          </Link>
          {direita && <div className="flex flex-wrap items-center gap-3 text-sm">{direita}</div>}
        </div>

        <nav className="border-t border-tinta-100" aria-label="Menu principal">
          <ul className="mx-auto flex max-w-6xl flex-wrap gap-x-1 px-4">
            {itens.map((i) => (
              <li key={i.para}>
                <NavLink
                  to={i.para}
                  end={i.fim}
                  className={({ isActive }) =>
                    `-mb-px block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-marca-600 text-tinta-900'
                        : 'border-transparent text-tinta-500 hover:border-tinta-300 hover:text-tinta-800'}`}
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

/** Menu das páginas abertas ao público. */
export const MENU_PUBLICO: ItemMenu[] = [
  { rotulo: 'Consulta pública', para: '/consulta' },
  { rotulo: 'Área restrita', para: '/', fim: true },
];
