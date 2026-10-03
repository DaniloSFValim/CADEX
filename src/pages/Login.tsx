import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { Button, ErrorNote, Field, inputClass } from '../components/ui';
import { useAuth } from '../lib/auth';
import { MENSAGEM_SAIDA, lerMotivo, limparMotivo } from '../lib/sessao';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // Saída automática (inatividade ou 12 h): explica uma vez por que pediu login.
  const [motivo] = useState(lerMotivo);
  useEffect(() => { limparMotivo(); }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho itens={MENU_PUBLICO} />
      <main className="flex flex-1 items-start justify-center px-4 py-16">
        <div className="cartao w-full max-w-sm p-8">
          <h1 className="text-xl font-semibold tracking-tight text-tinta-900">Área restrita</h1>
          <p className="mt-1 text-sm text-tinta-500">Acesso para servidores da SECONSER e do CISP.</p>
          {motivo && (
            <p role="status" className="mt-4 rounded-sm border-l-4 border-atencao bg-atencao/6 px-3 py-2 text-sm text-tinta-800">
              {MENSAGEM_SAIDA[motivo]}
            </p>
          )}

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

          <p className="mt-6 border-t border-tinta-100 pt-5 text-center text-sm">
            <Link to="/consulta" className="font-medium text-marca-700 hover:underline">
              Consultar empresas inscritas
            </Link>
          </p>
        </div>
      </main>
      <Rodape />
    </div>
  );
}
