import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

export interface ItemMenu { rotulo: string; para: string; fim?: boolean }

/**
 * Cabeçalho no modelo do portal da SECONSER: faixa branca com a
 * identificação e menu branco com itens separados por linhas verticais;
 * o item ativo em laranja, com traço laranja em cima.
 *
 * O logotipo oficial (Prefeitura de Niterói | SECONSER) foi fornecido pela
 * SECONSER: public/logo-prefeitura-seconser.png.
 */
export function Cabecalho({ itens, direita }: { itens: ItemMenu[]; direita?: ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <img
          src="/logo-prefeitura-seconser.png"
          alt="Prefeitura de Niterói — SECONSER"
          width={896}
          height={273}
          className="h-16 w-auto sm:h-24"
        />
        <div className="leading-tight sm:text-right">
          <div className="text-sm font-bold tracking-wide text-slate-800">CADEX</div>
          <div className="text-xs text-slate-600">Cadastro de Executores</div>
        </div>
      </div>

      <nav className="border-t border-slate-200" aria-label="Menu principal">
        <div className="mx-auto flex max-w-6xl flex-wrap items-stretch justify-between px-4">
          <ul className="flex flex-wrap">
            {itens.map((i) => (
              <li key={i.para} className="border-r border-slate-200 first:border-l">
                <NavLink
                  to={i.para}
                  end={i.fim}
                  className={({ isActive }) =>
                    `-mt-px block border-t-2 px-5 py-3 text-sm tracking-wide transition ${
                      isActive
                        ? 'border-marca-500 text-marca-700'
                        : 'border-transparent text-slate-700 hover:text-marca-700'}`}
                >
                  {i.rotulo}
                </NavLink>
              </li>
            ))}
          </ul>
          {direita && <div className="flex flex-wrap items-center gap-3 py-2 text-sm">{direita}</div>}
        </div>
      </nav>
    </header>
  );
}

/** Menu das páginas abertas ao público. */
export const MENU_PUBLICO: ItemMenu[] = [
  { rotulo: 'Consulta pública', para: '/consulta' },
  { rotulo: 'Área restrita', para: '/', fim: true },
];
