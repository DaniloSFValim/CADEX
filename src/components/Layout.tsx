import { Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { UsuarioSaida, itensRestritos } from './Cabecalho';
import { FaixaMarca } from './FaixaMarca';
import { Rodape } from './Rodape';

/**
 * Casca da área restrita: a mesma faixa de marca da área pública, com o
 * usuário e a saída à direita. O menu vem de `itensRestritos`, o mesmo usado
 * pelo cabeçalho das páginas públicas quando há alguém conectado.
 */
export function Layout() {
  const { servidor } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-tinta-50">
      <FaixaMarca itens={itensRestritos(servidor)} direita={<UsuarioSaida />} />

      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-10">
        <Outlet />
      </main>
      <Rodape />
    </div>
  );
}
