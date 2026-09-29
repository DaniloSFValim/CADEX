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
    <header className="sticky top-0 z-30 border-b border-tinta-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="bg-marca-900 text-xs text-white/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1.5">
          <span>
            <span className="font-semibold text-white">Prefeitura Municipal de Niterói</span>
            <span className="ml-3 hidden border-l border-white/25 pl-3 sm:inline">Secretaria de Conservação e Serviços Públicos</span>
          </span>
          <a href="https://www.seconser.niteroi.rj.gov.br/" target="_blank" rel="noopener noreferrer"
             className="hidden whitespace-nowrap underline-offset-4 hover:text-white hover:underline sm:inline">
            Portal da SECONSER
          </a>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pt-2.5 md:py-0">
        <Link to="/consulta" className="flex items-center gap-3.5 md:py-2.5">
          <img
            src="/logo-prefeitura-seconser.png"
            alt="Prefeitura de Niterói, SECONSER"
            width={896}
            height={273}
            className="h-9 w-auto sm:h-11"
          />
          <span className="h-8 w-px bg-tinta-200" aria-hidden />
          <span className="leading-tight">
            <span className="block text-lg font-extrabold tracking-[0.02em] text-marca-800">CADEX</span>
            <span className="block text-xs text-tinta-500">Cadastro de Executores</span>
          </span>
        </Link>

        <nav className="order-3 -mx-1 w-full overflow-x-auto md:order-none md:mx-0 md:w-auto md:overflow-visible"
             aria-label="Menu principal">
          <ul className="flex gap-2 whitespace-nowrap md:self-stretch">
            {itens.map((i) => (
              <li key={i.para}>
                <NavLink
                  to={i.para}
                  end={i.fim}
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center border-b-[3px] px-2 pt-[3px] text-sm transition-colors md:min-h-16 ${
                      isActive
                        ? 'border-marca-600 font-semibold text-marca-800'
                        : 'border-transparent text-tinta-500 hover:border-tinta-200 hover:text-tinta-900'}`}
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
