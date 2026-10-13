import { Link, Outlet } from 'react-router-dom';
import { PAPEL_LABEL, useAuth } from '../lib/auth';
import { FaixaMarca, type ItemMenu } from './FaixaMarca';
import { Rodape } from './Rodape';
import { Button } from './ui';

/**
 * Casca da área restrita: a mesma faixa de marca da área pública, com o
 * usuário e a saída à direita. As rotas, as permissões e os itens do menu são
 * os de sempre.
 */
export function Layout() {
  const { servidor, session, signOut } = useAuth();
  const isGestor = servidor?.papel === 'gestor';
  const soLicencas = servidor?.papel === 'licenciador';
  const itens: ItemMenu[] = soLicencas ? [
    { rotulo: 'Obras', para: '/obras', fim: true },
    { rotulo: 'Consulta pública', para: '/consulta' },
  ] : [
    { rotulo: 'Painel', para: '/dashboard' },
    ...(isGestor ? [{ rotulo: 'Anatel', para: '/anatel' }] : []),
    { rotulo: 'Empresas', para: '/empresas', fim: true },
    { rotulo: 'Obras', para: '/obras' },
    { rotulo: 'Órgãos', para: '/orgaos' },
    { rotulo: 'Consulta pública', para: '/consulta' },
    ...(servidor?.administrador ? [{ rotulo: 'Administração', para: '/admin' }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-tinta-50">
      <FaixaMarca
        itens={itens}
        direita={<>
          <Link to="/minha-conta" className="hidden text-right leading-tight hover:underline sm:block" title="Minha conta: trocar senha">
            <span className="block font-semibold">{servidor?.nome ?? session?.user.email}</span>
            {servidor && <span className="block text-xs text-white/75">{PAPEL_LABEL[servidor.papel]}</span>}
          </Link>
          <Button variant="secondary" className="px-3! py-1.5!" onClick={() => void signOut()}>Sair</Button>
        </>}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-10">
        <Outlet />
      </main>
      <Rodape />
    </div>
  );
}
