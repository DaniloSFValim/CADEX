import { NavLink } from 'react-router-dom';

/** Abas da consulta pública: empresas inscritas e obras licenciadas. */
export function AbasConsulta() {
  // Controle segmentado: um trilho cinza com a opção ativa em cartão branco, sombreado e em destaque.
  const aba = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-5 text-base font-semibold transition-colors sm:flex-none ${
      isActive ? 'bg-white text-tinta-900 shadow-sm ring-1 ring-tinta-200' : 'text-tinta-600 hover:text-tinta-900'}`;
  return (
    <nav className="mt-5" aria-label="Consulta pública">
      <ul className="inline-flex w-full gap-1 rounded-lg bg-tinta-200/70 p-1 sm:w-auto">
        <li className="flex flex-1 sm:flex-none"><NavLink to="/consulta" end className={aba}>Empresas</NavLink></li>
        <li className="flex flex-1 sm:flex-none"><NavLink to="/consulta/obras" className={aba}>Obras licenciadas</NavLink></li>
      </ul>
    </nav>
  );
}
