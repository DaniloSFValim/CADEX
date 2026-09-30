import { useState } from 'react';
import { Button, Card, ErrorNote, Field, Titulo, inputClass } from '../components/ui';
import { PAPEL_LABEL, useAuth } from '../lib/auth';
import { SENHA_MINIMA } from '../lib/contas';
import { supabase } from '../lib/supabase';

export default function MinhaConta() {
  const { servidor, session } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [feito, setFeito] = useState(false);

  return (
    <>
      <Titulo titulo="Minha conta" />
      <div className="grid max-w-3xl gap-8">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div><dt className="text-tinta-500">Nome</dt><dd className="font-medium text-tinta-900">{servidor?.nome}</dd></div>
          <div><dt className="text-tinta-500">E-mail</dt><dd className="font-medium text-tinta-900">{session?.user.email}</dd></div>
          <div>
            <dt className="text-tinta-500">Perfil</dt>
            <dd className="font-medium text-tinta-900">
              {servidor ? PAPEL_LABEL[servidor.papel] : ''}{servidor?.administrador ? ', administrador de contas' : ''}
            </dd>
          </div>
        </dl>

        <Card title="Trocar senha">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null); setFeito(false);
              if (senha !== confirmacao) { setError('As duas senhas não são iguais.'); return; }
              setBusy(true);
              try {
                const { error: erro } = await supabase.auth.updateUser({ password: senha });
                if (erro) throw erro;
                setFeito(true); setSenha(''); setConfirmacao('');
              } catch (err) { setError(err); } finally { setBusy(false); }
            }}
          >
            <Field label="Nova senha" hint={`Pelo menos ${SENHA_MINIMA} caracteres.`} required>
              <input className={inputClass} type="password" autoComplete="new-password" required minLength={SENHA_MINIMA}
                     value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Field>
            <Field label="Repita a nova senha" required>
              <input className={inputClass} type="password" autoComplete="new-password" required minLength={SENHA_MINIMA}
                     value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? 'Trocando…' : 'Trocar senha'}</Button>
              {feito && <span role="status" className="text-sm font-medium text-alta">Senha trocada.</span>}
              <ErrorNote error={error} />
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
