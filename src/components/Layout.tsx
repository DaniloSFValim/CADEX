import { Outlet } from 'react-router-dom';
import { PAPEL_LABEL, useAuth } from '../lib/auth';
import { Cabecalho } from './Cabecalho';
import { Rodape } from './Rodape';
import { Button } from './ui';

export function Layout() {
  const { servidor, session, signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho
        itens={[
          { rotulo: 'Empresas', para: '/', fim: true },
          { rotulo: 'Consulta pública', para: '/consulta' },
        ]}
        direita={<>
          <span className="text-slate-600">
            {servidor?.nome ?? session?.user.email}
            {servidor && <span className="ml-1 text-slate-400">· {PAPEL_LABEL[servidor.papel]}</span>}
          </span>
          <Button variant="secondary" className="!py-1" onClick={() => void signOut()}>Sair</Button>
        </>}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Rodape />
    </div>
  );
}
