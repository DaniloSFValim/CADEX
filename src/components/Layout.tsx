import { Link, NavLink, Outlet } from 'react-router-dom';
import { PAPEL_LABEL, useAuth } from '../lib/auth';
import { Rodape } from './Rodape';
import { Button } from './ui';

interface Item { rotulo: string; para: string; fim?: boolean }

/**
 * Casca da área restrita: uma faixa de marca no topo, com identidade, menu em
 * pílulas e o usuário. Vale nas telas largas e nas estreitas (o menu rola na
 * horizontal). As rotas, as permissões e os itens do menu são os de sempre.
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
    <div className="flex min-h-screen flex-col bg-tinta-50">
      <header className="relative overflow-hidden bg-gradient-to-br from-marca-900 to-marca-600 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-obra-500/20" />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 pt-4 lg:px-10">
          <Link to="/consulta/obras" className="flex items-center gap-3" title="CADEX, Cadastro de Executores">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-obra-500 font-display text-base font-extrabold text-tinta-900">CX</span>
            <span className="leading-tight">
              <span className="block font-display text-xl font-extrabold tracking-wide">CADEX</span>
              <span className="block text-xs text-white/75">SECONSER · Niterói</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link to="/minha-conta" className="hidden text-right leading-tight hover:underline sm:block" title="Minha conta: trocar senha">
              <span className="block font-semibold">{servidor?.nome ?? session?.user.email}</span>
              {servidor && <span className="block text-xs text-white/75">{PAPEL_LABEL[servidor.papel]}</span>}
            </Link>
            <Button variant="secondary" className="px-3! py-1.5!" onClick={() => void signOut()}>Sair</Button>
          </div>

          <nav aria-label="Menu principal" className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto pb-4 lg:-mx-10 lg:w-[calc(100%+5rem)]">
            <ul className="flex w-max gap-2 px-4 lg:px-10">
              {itens.map((i) => (
                <li key={i.para}>
                  <NavLink
                    to={i.para}
                    end={i.fim}
                    className={({ isActive }) =>
                      `inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
                        isActive ? 'bg-white text-marca-900' : 'bg-white/12 text-white hover:bg-white/20'}`}
                  >
                    {i.rotulo}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-10">
        <Outlet />
      </main>
      <Rodape />
    </div>
  );
}
