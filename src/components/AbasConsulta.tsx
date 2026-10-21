import { NavLink } from 'react-router-dom';

/** Abas da consulta pública: empresas inscritas e obras licenciadas. */
export function AbasConsulta() {
  // Botões de alternância do NETRANK: a aba ativa é preenchida em grafite.
  const aba = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-10 items-center rounded px-3 text-sm font-medium transition-colors ${
      isActive ? 'bg-tinta-900 text-white' : 'text-tinta-600 hover:bg-tinta-100 hover:text-tinta-900'}`;
  return (
    <nav className="mt-5" aria-label="Consulta pública">
      <ul className="flex flex-wrap gap-1">
        <li><NavLink to="/consulta" end className={aba}>Empresas</NavLink></li>
        <li><NavLink to="/consulta/obras" className={aba}>Obras licenciadas</NavLink></li>
      </ul>
    </nav>
  );
}
