import { Navigate, Route, Routes } from 'react-router-dom';
import { GuardaSessao } from './components/GuardaSessao';
import { Layout } from './components/Layout';
import { Button, Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import Consulta from './pages/Consulta';
import ConsultaObras from './pages/ConsultaObras';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CruzamentoAnatel from './pages/CruzamentoAnatel';
import Empresas from './pages/Empresas';
import EmpresaPage from './pages/EmpresaPage';
import Ficha from './pages/Ficha';
import Contas from './pages/Contas';
import MinhaConta from './pages/MinhaConta';
import Licencas from './pages/Licencas';
import LicencaPage from './pages/LicencaPage';
import LicencaPublica from './pages/LicencaPublica';
import PlacaLicenca from './pages/PlacaLicenca';
import { CadastrarMfa, ConfirmarMfa } from './pages/Mfa';

export function App() {
  return (
    <>
    <GuardaSessao />
    <Routes>
      {/* Consulta pública: aberta, com ou sem login (art. 7º, § 2º). */}
      <Route path="consulta" element={<Consulta />} />
      <Route path="consulta/obras" element={<ConsultaObras />} />
      {/* Página da placa do canteiro (art. 14): aberta pelo QR Code, sem login. */}
      <Route path="licenca/:codigo" element={<LicencaPublica />} />
      <Route path="*" element={<AreaRestrita />} />
    </Routes>
    </>
  );
}

function AreaRestrita() {
  const { session, servidor, mfa, loading, signOut } = useAuth();

  if (!isConfigured) {
    return (
      <p className="p-8 text-center text-sm text-baixa">
        Sistema sem conexão com o banco: faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
      </p>
    );
  }
  if (loading) return <Spinner />;
  if (!session) return <Login />;

  if (!servidor) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-tinta-700">
          O usuário <strong>{session.user.email}</strong> entrou, mas não está autorizado
          a usar o sistema. Peça ao administrador para incluí-lo como servidor.
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => void signOut()}>Sair</Button>
      </div>
    );
  }

  // Gestor e licenciador: senha + código do aplicativo (o banco exige o mesmo).
  if (mfa?.exigida && !mfa.confirmada) {
    return mfa.cadastrada ? <ConfirmarMfa /> : <CadastrarMfa />;
  }

  // Licenciador: única prerrogativa é registrar licenças de obra.
  if (servidor.papel === 'licenciador') {
    return (
      <Routes>
        <Route path="obras/:id/placa" element={<PlacaLicenca />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/obras" replace />} />
          <Route path="obras" element={<Licencas />} />
          <Route path="obras/nova" element={<LicencaPage />} />
          <Route path="obras/:id" element={<LicencaPage />} />
          <Route path="minha-conta" element={<MinhaConta />} />
          <Route path="*" element={<Navigate to="/obras" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Ficha para impressão: sem cabeçalho nem menu. */}
      <Route path="empresas/:id/ficha" element={<Ficha />} />
      <Route path="obras/:id/placa" element={<PlacaLicenca />} />
      <Route element={<Layout />}>
        <Route index element={<Empresas />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="anatel" element={<CruzamentoAnatel />} />
        <Route path="empresas/nova" element={<EmpresaPage />} />
        <Route path="empresas/:id" element={<EmpresaPage />} />
        <Route path="obras" element={<Licencas />} />
        <Route path="obras/nova" element={<LicencaPage />} />
        <Route path="obras/:id" element={<LicencaPage />} />
        <Route path="contas" element={<Contas />} />
        <Route path="minha-conta" element={<MinhaConta />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
