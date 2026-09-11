import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, useAuth, type Role } from '../lib/auth';

interface NavItem { to: string; label: string; roles: Role[] }

const NAV: NavItem[] = [
  { to: '/admin', label: 'Painel', roles: ['admin', 'gestor_seconser', 'analista_seconser'] },
  { to: '/admin/empresas', label: 'CADEX', roles: ['admin', 'gestor_seconser', 'analista_seconser'] },
  { to: '/empresa', label: 'Meu painel', roles: ['empresa'] },
  { to: '/campo', label: 'Campo', roles: ['fiscal_viario', 'guarda_civil', 'admin'] },
  { to: '/cisp', label: 'CISP', roles: ['cisp_seop', 'admin'] },
];

export function AppShell() {
  const { profile, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const visible = NAV.filter((n) => n.roles.some((r) => roles.includes(r)));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight text-gov-800">CADEX</span>
            <span className="hidden text-xs text-slate-500 sm:inline">
              Intervenções em espaço público
            </span>
          </NavLink>

          <nav className="flex flex-1 gap-1" aria-label="Principal">
            {visible.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/admin'}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm font-medium ${
                    isActive ? 'bg-gov-50 text-gov-800' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 text-right">
            <div className="hidden sm:block">
              <div className="text-sm font-medium text-slate-800">{profile?.full_name}</div>
              <div className="text-xs text-slate-500">
                {roles.map((r) => ROLE_LABEL[r]).join(' · ')}
              </div>
            </div>
            <button
              onClick={async () => { await signOut(); navigate('/'); }}
              className="rounded px-2 py-1 text-sm text-slate-600 underline-offset-2 hover:underline"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <NavLink to="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight text-gov-800">CADEX</span>
            <span className="hidden text-xs text-slate-500 sm:inline">
              Niterói · Portal público de intervenções
            </span>
          </NavLink>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink to="/consulta" className="text-slate-600 hover:text-gov-800">Consulta</NavLink>
            <NavLink
              to="/entrar"
              className="rounded-md bg-gov-700 px-3 py-1.5 font-medium text-white hover:bg-gov-800"
            >
              Acesso restrito
            </NavLink>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 text-xs text-slate-500">
          Relação de empresas com CADEX ativo e intervenções publicadas nos termos do
          art. 7º, § 2º, da Resolução Conjunta SECONSER/SEOP nº 001, de 09/09/2026, e do
          art. 17, parágrafo único, da Lei Municipal nº 3.988/2025 — Município de Niterói.
          Informações pessoais são omitidas desta consulta em observância à LGPD.
        </div>
      </footer>
    </div>
  );
}
