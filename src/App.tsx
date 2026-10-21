import { Navigate, Route, Routes } from 'react-router-dom';
import { GuardaSessao } from './components/GuardaSessao';
import { Layout } from './components/Layout';
import { Button, Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { lerMotivo } from './lib/sessao';
import Consulta from './pages/Consulta';
import ConsultaObras from './pages/ConsultaObras';
import Login from './pages/Login';
import Painel from './pages/Painel';
import Pendencias from './pages/Pendencias';
import CruzamentoAnatel from './pages/CruzamentoAnatel';
import Empresas from './pages/Empresas';
import EmpresaPage from './pages/EmpresaPage';
import Documentos from './pages/Documentos';

import Ficha from './pages/Ficha';
import Administracao from './pages/Administracao';
import AdminAuditoria from './pages/AdminAuditoria';
import AdminConfiguracoes from './pages/AdminConfiguracoes';
import AdminEmpresas from './pages/AdminEmpresas';
import AdminLicencas from './pages/AdminLicencas';
import AdminTipos from './pages/AdminTipos';
import Contas from './pages/Contas';
import Orgaos from './pages/Orgaos';
import MinhaConta from './pages/MinhaConta';
import Licencas from './pages/Licencas';
import LicencaPage from './pages/LicencaPage';
import LicencaPublica from './pages/LicencaPublica';
import PlacaLicenca from './pages/PlacaLicenca';
import SemLicenca, { FormSemLicencaPage } from './pages/SemLicenca';
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
      {/* Entrada dos servidores (área restrita). O público cai no mapa. */}
      <Route path="entrar" element={<Login />} />
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
  // Sem login, a porta de entrada é o mapa público de obras, não a tela de
  // acesso. Os servidores entram pela "Área restrita" (/entrar). Mas se a
  // sessão expirou (há um motivo guardado), leva à tela de acesso para
  // explicar a saída e deixar entrar de novo.
  if (!session) return <Navigate to={lerMotivo() ? '/entrar' : '/consulta/obras'} replace />;

  if (!servidor) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-tinta-700">
          O usuário <strong>{session.user.email}</strong> entrou, mas não está autorizado
          a usar o sistema: o acesso não existe ou foi desativado. Peça ao administrador.
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
          <Route path="obras/sem-licenca" element={<SemLicenca />} />
          <Route path="obras/sem-licenca/nova" element={<FormSemLicencaPage />} />
          <Route path="obras/sem-licenca/:id" element={<FormSemLicencaPage />} />
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
        {/* Home por papel: o gestor abre no Painel; o CISP, nas Empresas. */}
        <Route index element={<Navigate to={servidor.papel === 'gestor' ? '/dashboard' : '/empresas'} replace />} />
        <Route path="empresas" element={<Empresas />} />
        <Route path="dashboard" element={<Painel />} />
        <Route path="dashboard/pendencias" element={<Pendencias />} />
        <Route path="anatel" element={<CruzamentoAnatel />} />
        <Route path="empresas/nova" element={<EmpresaPage />} />
        <Route path="empresas/:id" element={<EmpresaPage />} />
        <Route path="empresas/:id/documentos" element={<Documentos />} />
        <Route path="obras" element={<Licencas />} />
        <Route path="obras/sem-licenca" element={<SemLicenca />} />
        <Route path="obras/sem-licenca/nova" element={<FormSemLicencaPage />} />
        <Route path="obras/sem-licenca/:id" element={<FormSemLicencaPage />} />
        <Route path="obras/nova" element={<LicencaPage />} />
        <Route path="obras/:id" element={<LicencaPage />} />
        <Route path="orgaos" element={<Navigate to="/admin/orgaos" replace />} />
        <Route path="admin" element={<Administracao />}>
          <Route index element={<Contas />} />
          <Route path="empresas" element={<AdminEmpresas />} />
          <Route path="licencas" element={<AdminLicencas />} />
          <Route path="tipos" element={<AdminTipos />} />
          <Route path="orgaos" element={<Orgaos />} />
          <Route path="configuracoes" element={<AdminConfiguracoes />} />
          <Route path="auditoria" element={<AdminAuditoria />} />
        </Route>
        <Route path="contas" element={<Navigate to="/admin" replace />} />
        <Route path="minha-conta" element={<MinhaConta />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
