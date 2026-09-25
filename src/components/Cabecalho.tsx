import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

export interface ItemMenu { rotulo: string; para: string; fim?: boolean }

/**
 * Cabeçalho no modelo do portal da SECONSER: faixa branca com a
 * identificação e menu branco com itens separados por linhas verticais;
 * o item ativo em laranja, com traço laranja em cima.
 *
 * O logotipo da Prefeitura é marca oficial em imagem: entra aqui quando
 * o arquivo for fornecido. Até lá, a identificação é textual.
 */
export function Cabecalho({ itens, direita }: { itens: ItemMenu[]; direita?: ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-5">
        <div className="leading-tight">
          <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-marca-700">Prefeitura de</div>
          <div className="text-2xl font-bold text-marca-600">Niterói</div>
        </div>
        <div className="hidden h-12 w-px bg-slate-300 sm:block" aria-hidden />
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wide text-slate-800">SECONSER</div>
          <div className="text-xs text-slate-600">CADEX · Cadastro de Executores</div>
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
