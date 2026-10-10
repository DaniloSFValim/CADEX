import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { Button, ErrorNote, Field, inputClass } from '../components/ui';
import { useAuth } from '../lib/auth';
import { MENSAGEM_SAIDA, lerMotivo, limparMotivo } from '../lib/sessao';

export default function Login() {
  const { signIn, session } = useAuth();
  const navigate = useNavigate();
  // Autenticou: o roteamento da área restrita assume a partir da raiz.
  useEffect(() => { if (session) navigate('/', { replace: true }); }, [session, navigate]);
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
      <main className="grid flex-1 lg:grid-cols-2 lg:min-h-[calc(100vh-65px)]">
        {/* Painel institucional: a mesma identidade do mapa público. */}
        <aside className="hidden flex-col justify-between bg-marca-900 p-12 text-white lg:flex xl:p-16">
          <p className="flex items-center gap-2.5 text-sm font-medium text-marca-200">
                        Área restrita
          </p>
          <div>
            <h2 className="max-w-[18ch] font-display text-3xl font-bold leading-[1.08] tracking-[-0.01em] xl:text-4xl">
              A fiscalização de obras na via pública, num só lugar.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-marca-100/85">
              Cadastro de executores, licenciamento de obras e transparência pública, sob a Resolução
              Conjunta SECONSER/SEOP nº&nbsp;001/2026.
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-marca-200">
            <li>Executores</li>
            <li aria-hidden className="text-marca-100/30">·</li>
            <li>Licenças de obra</li>
            <li aria-hidden className="text-marca-100/30">·</li>
            <li>Fiscalização</li>
          </ul>
        </aside>

        {/* Formulário de acesso. */}
        <div className="flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-tinta-900">Entrar</h1>
            <p className="mt-1.5 text-sm text-tinta-500">Acesso para servidores da SECONSER e do CISP.</p>
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
        </div>
      </main>
      <Rodape />
    </div>
  );
}
