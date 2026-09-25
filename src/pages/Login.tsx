import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { Button, ErrorNote, Field, inputClass } from '../components/ui';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho itens={MENU_PUBLICO} />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-800">Área restrita</h1>
          <p className="mt-1 text-sm text-slate-600">Acesso dos servidores da SECONSER e do CISP.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true); setError(null);
              try { await signIn(email.trim(), password); }
              catch (err) { setError(err); }
              finally { setBusy(false); }
            }}
          >
            <Field label="E-mail" required>
              <input id="login-email" className={inputClass} type="email" autoComplete="username"
                     required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Senha" required>
              <input id="login-senha" className={inputClass} type="password" autoComplete="current-password"
                     required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <ErrorNote error={error} />
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <p className="mt-6 border-t border-slate-100 pt-4 text-center text-sm">
            <Link to="/consulta" className="text-marca-700 hover:underline">
              Consulta pública de empresas inscritas →
            </Link>
          </p>
        </div>
      </main>
      <Rodape />
    </div>
  );
}
