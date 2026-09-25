import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Button, Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import Consulta from './pages/Consulta';
import Login from './pages/Login';
import Empresas from './pages/Empresas';
import EmpresaPage from './pages/EmpresaPage';

export function App() {
  return (
    <Routes>
      {/* Consulta pública: aberta, com ou sem login (art. 7º, § 2º). */}
      <Route path="consulta" element={<Consulta />} />
      <Route path="*" element={<AreaRestrita />} />
    </Routes>
  );
}

function AreaRestrita() {
  const { session, servidor, loading, signOut } = useAuth();

  if (!isConfigured) {
    return (
      <p className="p-8 text-center text-sm text-red-800">
        Sistema sem conexão com o banco: faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
      </p>
    );
  }
  if (loading) return <Spinner />;
  if (!session) return <Login />;

  if (!servidor) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-slate-700">
          O usuário <strong>{session.user.email}</strong> entrou, mas não está autorizado
          a usar o sistema. Peça ao administrador para incluí-lo como servidor.
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => void signOut()}>Sair</Button>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Empresas />} />
        <Route path="empresas/nova" element={<EmpresaPage />} />
        <Route path="empresas/:id" element={<EmpresaPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
