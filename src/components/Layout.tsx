import { Outlet } from 'react-router-dom';
import { PAPEL_LABEL, useAuth } from '../lib/auth';
import { Cabecalho } from './Cabecalho';
import { Rodape } from './Rodape';
import { Button } from './ui';

export function Layout() {
  const { servidor, session, signOut } = useAuth();
  const isGestor = servidor?.papel === 'gestor';
  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho
        itens={[
          ...(isGestor ? [{ rotulo: 'Painel', para: '/dashboard' }] : []),
          { rotulo: 'Empresas', para: '/', fim: true },
          { rotulo: 'Consulta pública', para: '/consulta' },
        ]}
        direita={<>
          <span className="text-right leading-tight">
            <span className="block font-medium text-tinta-800">{servidor?.nome ?? session?.user.email}</span>
            {servidor && <span className="block text-xs text-tinta-500">{PAPEL_LABEL[servidor.papel]}</span>}
          </span>
          <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => void signOut()}>Sair</Button>
        </>}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Outlet />
      </main>
      <Rodape />
    </div>
  );
}
