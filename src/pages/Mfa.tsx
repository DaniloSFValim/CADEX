import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Cabecalho } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { Button, ErrorNote, Field, inputClass } from '../components/ui';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

/** Moldura das telas de verificação: sem menu, só a saída. */
function Moldura({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { signOut, session } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho
        itens={[]}
        direita={<>
          <span className="hidden text-tinta-500 sm:inline">{session?.user.email}</span>
          <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => void signOut()}>Sair</Button>
        </>}
      />
      <main className="flex flex-1 items-start justify-center px-4 py-12">
        <div className="cartao w-full max-w-xl p-8">
          <h1 className="text-xl font-bold tracking-tight text-tinta-900">{titulo}</h1>
          {children}
        </div>
      </main>
      <Rodape />
    </div>
  );
}

/** Seis dígitos, aceitando colar com espaço ("123 456"). */
function CampoCodigo({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <Field label="Código de 6 dígitos do aplicativo" required>
      <input
        className={`${inputClass} tabular !py-3 text-center !text-2xl tracking-[0.4em]`}
        inputMode="numeric" autoComplete="one-time-code" autoFocus required
        pattern="[0-9]{6}" maxLength={6} placeholder="000000"
        value={valor} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </Field>
  );
}

const mensagemCodigo = (err: unknown) => {
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
  return /invalid|expired|incorrect/i.test(msg)
    ? 'Código incorreto ou vencido. Espere o aplicativo mostrar um código novo e digite de novo.'
    : msg;
};

/** Primeiro acesso: cadastrar o aplicativo lendo o QR code. */
export function CadastrarMfa() {
  const [qr, setQr] = useState<string | null>(null);
  const [segredo, setSegredo] = useState('');
  const [fatorId, setFatorId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erroInicio, setErroInicio] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    (async () => {
      // Cadastro abandonado no meio deixa um fator não confirmado; recomeça limpo.
      const { data: lista } = await supabase.auth.mfa.listFactors();
      for (const f of lista?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp', issuer: 'CADEX Niterói', friendlyName: `CADEX ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) { setErroInicio(error); return; }
      setFatorId(data.id);
      setQr(data.totp.qr_code);
      setSegredo(data.totp.secret);
    })().catch(setErroInicio);
  }, []);

  return (
    <Moldura titulo="Ative a verificação em duas etapas">
      <p className="mt-2 text-sm text-tinta-600">
        Quem cadastra empresas e decide inscrições entra com a senha <strong>e</strong> com um código do celular.
        Isso é feito uma única vez e leva uns 2 minutos.
      </p>

      <ol className="mt-6 space-y-6 text-sm text-tinta-700">
        <li>
          <p className="font-semibold text-tinta-900">1. Instale um aplicativo autenticador no celular</p>
          <p className="mt-1">
            Qualquer um serve: <strong>Google Authenticator</strong> ou <strong>Microsoft Authenticator</strong> (Android
            e iPhone, gratuitos na loja). No iPhone também dá para usar o app <strong>Senhas</strong>, que já vem instalado.
          </p>
        </li>
        <li>
          <p className="font-semibold text-tinta-900">2. No aplicativo, toque em “+” e leia este QR code</p>
          <div className="mt-3 flex flex-wrap items-start gap-5">
            <div className="flex h-44 w-44 flex-none items-center justify-center rounded border border-tinta-200 bg-white p-2">
              {qr ? <img src={qr} alt="QR code para cadastrar o CADEX no aplicativo autenticador" className="h-full w-full" />
                  : <span className="text-xs text-tinta-400">{erroInicio ? '—' : 'Gerando…'}</span>}
            </div>
            <div className="min-w-0 flex-1 text-xs text-tinta-500">
              Não consegue ler? Escolha “inserir chave” no aplicativo e digite:
              <code className="mt-1 block break-all rounded bg-tinta-50 px-2 py-1.5 font-semibold tracking-wider text-tinta-900">
                {segredo || '…'}
              </code>
            </div>
          </div>
          <ErrorNote error={erroInicio} />
        </li>
        <li>
          <p className="font-semibold text-tinta-900">3. Digite o código que aparece no aplicativo</p>
          <form
            className="mt-3 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true); setError(null);
              try {
                const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo });
                if (error) throw error;
                // A sessão passa a aal2 e o login recarrega sozinho (onAuthStateChange).
              } catch (err) { setError(mensagemCodigo(err)); setCodigo(''); } finally { setBusy(false); }
            }}
          >
            <CampoCodigo valor={codigo} onChange={setCodigo} />
            <ErrorNote error={error} />
            <Button type="submit" className="w-full" disabled={busy || !fatorId || codigo.length !== 6}>
              {busy ? 'Conferindo…' : 'Ativar e entrar'}
            </Button>
          </form>
        </li>
      </ol>
    </Moldura>
  );
}

/** Todo login: pedir o código do aplicativo já cadastrado. */
export function ConfirmarMfa() {
  const { mfa } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Moldura titulo="Código do aplicativo">
      <p className="mt-2 text-sm text-tinta-600">
        Abra o aplicativo autenticador no celular e digite o código de 6 dígitos da conta <strong>CADEX Niterói</strong>.
        O código muda a cada 30 segundos.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!mfa?.fatorId) return;
          setBusy(true); setError(null);
          try {
            const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfa.fatorId, code: codigo });
            if (error) throw error;
          } catch (err) { setError(mensagemCodigo(err)); setCodigo(''); } finally { setBusy(false); }
        }}
      >
        <CampoCodigo valor={codigo} onChange={setCodigo} />
        <ErrorNote error={error} />
        <Button type="submit" className="w-full" disabled={busy || codigo.length !== 6}>
          {busy ? 'Conferindo…' : 'Entrar'}
        </Button>
      </form>
      <p className="mt-6 border-t border-tinta-100 pt-5 text-sm text-tinta-500">
        Perdeu ou trocou de celular? Peça a um administrador de contas para zerar a sua verificação em duas etapas.
        No próximo acesso você cadastra o aplicativo de novo.
      </p>
    </Moldura>
  );
}
