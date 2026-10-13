import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** Abas do painel: a visão geral das licenças e, para o gestor, as pendências de ação. */
export function AbasPainel() {
  const { podeEditar } = useAuth();
  const aba = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-10 items-center rounded px-3 text-sm font-medium transition-colors ${
      isActive ? 'bg-tinta-900 text-white' : 'text-tinta-600 hover:bg-tinta-100 hover:text-tinta-900'}`;
  // Sem a aba das pendências o gestor é o único que veria duas; o CISP só tem a visão geral.
  if (!podeEditar) return null;
  return (
    <nav className="mb-8" aria-label="Painel">
      <ul className="flex flex-wrap gap-1">
        <li><NavLink to="/dashboard" end className={aba}>Visão geral</NavLink></li>
        <li><NavLink to="/dashboard/pendencias" className={aba}>Pendências</NavLink></li>
      </ul>
    </nav>
  );
}
