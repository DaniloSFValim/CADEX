import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, homeFor, type Role } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { Spinner } from './components/ui';
import { AppShell } from './components/Layout';

import PublicHome from './pages/public/PublicHome';
import PublicVerify from './pages/public/PublicVerify';
import PublicConsulta from './pages/public/PublicConsulta';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import CompaniesList from './pages/admin/CompaniesList';
import CompanyDetail from './pages/admin/CompanyDetail';
import CompanyPanel from './pages/company/CompanyPanel';
import FieldHome from './pages/field/FieldHome';
import FieldInspection from './pages/field/FieldInspection';
import CispEmergency from './pages/CispEmergency';

/** Guarda de rota (§35). A autorização real é a RLS; isto é navegação. */
function Require({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const { session, roles: mine, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/entrar" replace />;
  if (roles.length > 0 && !roles.some((r) => mine.includes(r))) {
    return <Navigate to={homeFor(mine)} replace />;
  }
  return children;
}

export function App() {
  if (!isConfigured) return <NotConfigured />;

  return (
    <Routes>
      {/* §29 — portal público, sem login */}
      <Route path="/" element={<PublicHome />} />
      <Route path="/consulta" element={<PublicConsulta />} />
      <Route path="/verificar/:token" element={<PublicVerify />} />
      <Route path="/entrar" element={<Login />} />

      {/* Área autenticada */}
      <Route element={<AppShell />}>
        <Route
          path="/admin"
          element={<Require roles={['admin', 'gestor_seconser', 'analista_seconser']}><AdminDashboard /></Require>}
        />
        <Route
          path="/admin/empresas"
          element={<Require roles={['admin', 'gestor_seconser', 'analista_seconser']}><CompaniesList /></Require>}
        />
        <Route
          path="/admin/empresas/:id"
          element={<Require roles={['admin', 'gestor_seconser', 'analista_seconser']}><CompanyDetail /></Require>}
        />
        <Route path="/empresa" element={<Require roles={['empresa']}><CompanyPanel /></Require>} />
        <Route path="/campo" element={<Require roles={['fiscal_viario', 'guarda_civil', 'admin']}><FieldHome /></Require>} />
        <Route
          path="/campo/fiscalizacao/:token?"
          element={<Require roles={['fiscal_viario', 'guarda_civil', 'admin']}><FieldInspection /></Require>}
        />
        <Route path="/cisp" element={<Require roles={['cisp_seop', 'admin']}><CispEmergency /></Require>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function NotConfigured() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold text-slate-900">Backend não configurado</h1>
      <p className="mt-3 text-sm text-slate-700">
        O CADEX não opera com dados simulados. Defina <code>VITE_SUPABASE_URL</code> e{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> e recarregue. O passo a passo está em{' '}
        <code>ENVIRONMENT.md</code>.
      </p>
    </main>
  );
}
