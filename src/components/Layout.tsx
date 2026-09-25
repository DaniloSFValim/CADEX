import { Rodape } from './Rodape';
import { Link, Outlet } from 'react-router-dom';
import { PAPEL_LABEL, useAuth } from '../lib/auth';
import { Button } from './ui';

export function Layout() {
  const { servidor, session, signOut } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-gov-900 bg-gov-800 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="font-bold tracking-tight">
            CADEX <span className="font-normal text-gov-200">· Cadastro de empresas</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link to="/consulta" className="text-gov-200 hover:text-white">Consulta pública</Link>
            <span className="text-gov-100">
              {servidor?.nome ?? session?.user.email}
              {servidor && <span className="ml-1 text-gov-300">· {PAPEL_LABEL[servidor.papel]}</span>}
            </span>
            <Button variant="secondary" onClick={() => void signOut()}>Sair</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <Rodape />
    </div>
  );
}
