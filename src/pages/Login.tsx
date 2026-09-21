import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../lib/auth';
import { Button, ErrorNote, Field, inputClass } from '../components/ui';

export default function Login() {
  const { session, roles, signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to={homeFor(roles)} replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gov-800">CADEX</h1>
        <p className="mt-1 text-sm text-slate-600">Acesso restrito ao sistema.</p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setError(null);
            try {
              await signIn(email.trim(), password);
              // Sem navegação explícita aqui: `navigate('/')` levava o
              // usuário ao portal público e ninguém o tirava de lá. Quem
              // redireciona é o <Navigate> acima, depois que os papéis
              // chegam do banco — cada perfil tem sua rota inicial.
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="E-mail" required>
            <input
              className={inputClass}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Senha" required>
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <ErrorNote error={error} />

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-5 text-xs text-slate-500">
          Empresas ainda não cadastradas devem solicitar inscrição no CADEX junto
          à SECONSER. O acesso é concedido ao preposto indicado.
        </p>
      </div>
    </div>
  );
}
