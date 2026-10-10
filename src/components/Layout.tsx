import { Link, NavLink, Outlet } from 'react-router-dom';
import { PAPEL_LABEL, useAuth } from '../lib/auth';
import { Rodape } from './Rodape';
import { Button } from './ui';

interface Item { rotulo: string; para: string; fim?: boolean }

/**
 * Casca da área restrita: barra lateral escura com a identidade do sistema e
 * a navegação. Em telas pequenas a barra vira uma faixa de topo rolável. As
 * rotas, as permissões e os itens do menu são os mesmos de antes.
 */
export function Layout() {
  const { servidor, session, signOut } = useAuth();
  const isGestor = servidor?.papel === 'gestor';
  const soLicencas = servidor?.papel === 'licenciador';
  const itens: Item[] = soLicencas ? [
    { rotulo: 'Obras', para: '/obras', fim: true },
    { rotulo: 'Consulta pública', para: '/consulta' },
  ] : [
    ...(isGestor ? [{ rotulo: 'Painel', para: '/dashboard' }, { rotulo: 'Anatel', para: '/anatel' }] : []),
    { rotulo: 'Empresas', para: '/empresas', fim: true },
    { rotulo: 'Obras', para: '/obras' },
    { rotulo: 'Órgãos', para: '/orgaos' },
    { rotulo: 'Consulta pública', para: '/consulta' },
    ...(servidor?.administrador ? [{ rotulo: 'Contas', para: '/contas' }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-tinta-50 lg:flex-row">
      <aside className="sticky top-0 z-30 border-b border-marca-900 bg-marca-900 text-white lg:h-screen lg:w-60 lg:flex-none lg:border-b-0">
        <div className="flex flex-col gap-1 px-4 py-3 lg:h-full lg:px-4 lg:py-6">
          <Link to="/consulta/obras" className="flex items-center gap-3 px-2 pb-2 lg:pb-6" title="CADEX, Cadastro de Executores">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-obra-500 font-display text-base font-extrabold text-tinta-900">CX</span>
            <span className="min-w-0">
              <span className="block font-display text-lg font-bold leading-tight">CADEX</span>
              <span className="block text-xs text-marca-200/80">SECONSER · Niterói</span>
            </span>
          </Link>

          <nav aria-label="Menu principal" className="-mx-1 overflow-x-auto lg:mx-0 lg:overflow-visible">
            <ul className="flex gap-1 whitespace-nowrap lg:flex-col">
              {itens.map((i) => (
                <li key={i.para}>
                  <NavLink
                    to={i.para}
                    end={i.fim}
                    className={({ isActive }) =>
                      `flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-white/10 text-white lg:shadow-[inset_3px_0_0_var(--color-obra-500)]'
                          : 'text-marca-100/85 hover:bg-white/5 hover:text-white'}`}
                  >
                    {i.rotulo}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-auto hidden border-t border-white/10 pt-4 text-sm lg:block">
            <Link to="/minha-conta" className="block rounded-lg px-2 py-1.5 hover:bg-white/5" title="Minha conta: trocar senha">
              <span className="block truncate font-semibold text-white">{servidor?.nome ?? session?.user.email}</span>
              {servidor && <span className="block text-xs text-marca-200/75">{PAPEL_LABEL[servidor.papel]}</span>}
            </Link>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => void signOut()}>Sair</Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Em telas pequenas, a identidade do usuário e a saída ficam no topo. */}
        <div className="flex items-center justify-between gap-3 border-b border-tinta-200 bg-white px-4 py-2 text-sm lg:hidden">
          <Link to="/minha-conta" className="min-w-0 truncate" title="Minha conta: trocar senha">
            <span className="font-medium text-tinta-800">{servidor?.nome ?? session?.user.email}</span>
            {servidor && <span className="ml-2 text-xs text-tinta-500">{PAPEL_LABEL[servidor.papel]}</span>}
          </Link>
          <Button variant="secondary" className="px-3! py-1.5!" onClick={() => void signOut()}>Sair</Button>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-10">
          <Outlet />
        </main>
        <Rodape />
      </div>
    </div>
  );
}
