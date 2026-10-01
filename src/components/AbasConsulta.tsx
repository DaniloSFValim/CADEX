import { NavLink } from 'react-router-dom';

/** Abas da consulta pública: empresas inscritas e obras licenciadas. */
export function AbasConsulta() {
  const aba = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 items-center border-b-[3px] px-1 text-base transition-colors ${
      isActive ? 'border-marca-600 font-semibold text-marca-800' : 'border-transparent text-tinta-500 hover:text-tinta-900'}`;
  return (
    <nav className="mt-8 border-b border-tinta-200" aria-label="Consulta pública">
      <ul className="flex gap-6">
        <li><NavLink to="/consulta" end className={aba}>Empresas</NavLink></li>
        <li><NavLink to="/consulta/obras" className={aba}>Obras licenciadas</NavLink></li>
      </ul>
    </nav>
  );
}
