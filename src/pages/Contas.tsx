import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Field, Spinner, Titulo, inputClass, tabela } from '../components/ui';
import { useAuth, type Papel } from '../lib/auth';
import {
  SENHA_MINIMA, criarConta, definirAcesso, gerarSenhaProvisoria, listarContas, redefinirSenha, removerAcesso,
  type Conta,
} from '../lib/contas';

const PERFIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  { valor: 'gestor', rotulo: 'SECONSER', descricao: 'cadastra, altera e decide inscrições' },
  { valor: 'cisp', rotulo: 'CISP', descricao: 'só consulta, sem ver documentos' },
];

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca entrou';

export default function Contas() {
  const { servidor, session } = useAuth();
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    listarContas().then(setContas).catch(setError);
  }, []);
  const ehAdmin = servidor?.administrador === true;
  useEffect(() => { if (ehAdmin) carregar(); }, [ehAdmin, carregar]);

  if (!ehAdmin) {
    return <Empty>Só administrador gerencia contas e acessos.</Empty>;
  }

  const comAcesso = (contas ?? []).filter((c) => c.papel);
  const semAcesso = (contas ?? []).filter((c) => !c.papel);

  return (
    <>
      <Titulo
        titulo="Contas e acessos"
        descricao="Quem entra na área restrita do CADEX e o que cada um pode fazer. Toda mudança fica registrada na auditoria."
      />

      <div className="flex flex-col gap-10">
        <NovaConta onCriada={(msg) => { setAviso(msg); carregar(); }} />

        {aviso && (
          <div role="status" className="rounded border-l-4 border-alta bg-alta/10 px-4 py-3 text-sm text-tinta-800">
            {aviso}
            <button type="button" className="ml-3 font-semibold text-marca-700 underline" onClick={() => setAviso(null)}>
              Fechar
            </button>
          </div>
        )}

        <Card title={`Com acesso (${comAcesso.length})`} semPadding>
          <ErrorNote error={error} />
          {!contas && !error && <Spinner />}
          {contas && comAcesso.length === 0 && <Empty>Nenhuma conta com acesso.</Empty>}
          {comAcesso.length > 0 && (
            <div className={tabela.moldura}>
              <table className={tabela.tabela}>
                <thead className={tabela.cabeca}>
                  <tr>
                    <th className={tabela.th}>Servidor</th>
                    <th className={tabela.th}>Perfil</th>
                    <th className={tabela.th}>Administrador</th>
                    <th className={tabela.th}>Último acesso</th>
                    <th className={tabela.th}><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {comAcesso.map((c) => (
                    <LinhaConta key={c.user_id} conta={c} ehVoce={c.user_id === session?.user.id}
                                onMudou={(msg) => { setAviso(msg); carregar(); }} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {semAcesso.length > 0 && (
          <Card title={`Sem acesso ao CADEX (${semAcesso.length})`} semPadding>
            <p className="border-b border-tinta-100 px-4 py-3 text-sm text-tinta-500">
              Contas de login que existem no Supabase, mas não entram na área restrita.
            </p>
            <div className={tabela.moldura}>
              <table className={tabela.tabela}>
                <tbody>
                  {semAcesso.map((c) => (
                    <LinhaSemAcesso key={c.user_id} conta={c} onMudou={(msg) => { setAviso(msg); carregar(); }} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function SeletorPerfil({ valor, onChange, completo = false }: { valor: Papel; onChange: (p: Papel) => void; completo?: boolean }) {
  return (
    <select className={inputClass} value={valor} onChange={(e) => onChange(e.target.value as Papel)} aria-label="Perfil">
      {PERFIS.map((p) => <option key={p.valor} value={p.valor}>{completo ? `${p.rotulo} – ${p.descricao}` : p.rotulo}</option>)}
    </select>
  );
}

function NovaConta({ onCriada }: { onCriada: (msg: string) => void }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('gestor');
  const [administrador, setAdministrador] = useState(false);
  const [senha, setSenha] = useState(gerarSenhaProvisoria);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  return (
    <Card title="Nova conta">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          try {
            await criarConta({ nome: nome.trim(), email: email.trim(), papel, administrador, senha });
            onCriada(`Conta criada para ${nome.trim()}. Passe ao servidor o e-mail ${email.trim()} e a senha provisória ${senha}, e peça para trocá-la em "Minha conta" no primeiro acesso.`);
            setNome(''); setEmail(''); setPapel('gestor'); setAdministrador(false); setSenha(gerarSenhaProvisoria());
          } catch (err) { setError(err); } finally { setBusy(false); }
        }}
      >
        <Field label="Nome" required>
          <input className={inputClass} required value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="E-mail" required>
          <input className={inputClass} type="email" required autoComplete="off" value={email}
                 onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Perfil" required>
          <SeletorPerfil valor={papel} onChange={setPapel} completo />
        </Field>
        <Field label="Senha provisória" hint={`Pelo menos ${SENHA_MINIMA} caracteres. O servidor troca no primeiro acesso.`} required>
          <div className="flex gap-2">
            <input className={`${inputClass} tabular`} required minLength={SENHA_MINIMA} value={senha}
                   onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
            <Button variant="secondary" onClick={() => setSenha(gerarSenhaProvisoria())}>Gerar outra</Button>
          </div>
        </Field>
        <label className="flex items-start gap-2 text-sm text-tinta-700 md:col-span-2">
          <input type="checkbox" className="mt-0.5" checked={administrador} onChange={(e) => setAdministrador(e.target.checked)} />
          <span>
            <span className="font-medium">Administrador de contas</span>
            <span className="block text-tinta-500">Pode criar contas, mudar perfis e tirar acessos, inclusive de outros administradores.</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? 'Criando…' : 'Criar conta'}</Button>
          <ErrorNote error={error} />
        </div>
      </form>
    </Card>
  );
}

function LinhaConta({ conta, ehVoce, onMudou }: { conta: Conta; ehVoce: boolean; onMudou: (msg: string) => void }) {
  const [nome, setNome] = useState(conta.nome ?? '');
  const [papel, setPapel] = useState<Papel>(conta.papel ?? 'gestor');
  const [administrador, setAdministrador] = useState(conta.administrador);
  const [modo, setModo] = useState<'normal' | 'remover' | 'senha'>('normal');
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const alterado = nome.trim() !== conta.nome || papel !== conta.papel || administrador !== conta.administrador;

  const agir = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setError(null);
    try { await fn(); setModo('normal'); onMudou(msg); } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <tr className={tabela.linha}>
      <td className={tabela.td}>
        <input className={`${inputClass} !py-1.5`} value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome" />
        <div className="mt-1 text-xs text-tinta-500">
          {conta.email}{ehVoce && <span className="ml-2"><Badge>você</Badge></span>}
        </div>
      </td>
      <td className={`${tabela.td} min-w-[140px]`}>
        <SeletorPerfil valor={papel} onChange={setPapel} />
      </td>
      <td className={tabela.td}>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={administrador} disabled={ehVoce}
                 onChange={(e) => setAdministrador(e.target.checked)} />
          {administrador ? 'Sim' : 'Não'}
        </label>
        {ehVoce && <div className="text-xs text-tinta-500">outro administrador altera</div>}
      </td>
      <td className={`${tabela.td} tabular whitespace-nowrap text-xs text-tinta-600`}>{dataHora(conta.ultimo_acesso)}</td>
      <td className={`${tabela.td} min-w-[260px]`}>
        {modo === 'normal' && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button className="!px-3 !py-1.5" disabled={!alterado || busy}
                    onClick={() => agir(() => definirAcesso(conta.user_id, nome.trim(), papel, administrador),
                      `Acesso de ${nome.trim()} atualizado.`)}>
              Salvar
            </Button>
            <Button variant="secondary" className="!px-3 !py-1.5"
                    onClick={() => { setSenha(gerarSenhaProvisoria()); setModo('senha'); }}>
              Redefinir senha
            </Button>
            {!ehVoce && (
              <Button variant="danger" className="!px-3 !py-1.5" onClick={() => setModo('remover')}>Remover acesso</Button>
            )}
          </div>
        )}
        {modo === 'remover' && (
          <div className="flex flex-col items-end gap-2 text-right text-sm">
            <span className="text-tinta-700">{conta.nome} deixa de entrar na área restrita. A conta de login continua existindo.</span>
            <div className="flex gap-2">
              <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setModo('normal')}>Cancelar</Button>
              <Button variant="danger" className="!px-3 !py-1.5" disabled={busy}
                      onClick={() => agir(() => removerAcesso(conta.user_id), `Acesso de ${conta.nome} removido.`)}>
                Confirmar remoção
              </Button>
            </div>
          </div>
        )}
        {modo === 'senha' && (
          <div className="flex flex-col items-end gap-2">
            <input className={`${inputClass} tabular !py-1.5`} value={senha} minLength={SENHA_MINIMA}
                   onChange={(e) => setSenha(e.target.value)} aria-label="Nova senha provisória" />
            <div className="flex gap-2">
              <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setModo('normal')}>Cancelar</Button>
              <Button className="!px-3 !py-1.5" disabled={busy || senha.length < SENHA_MINIMA}
                      onClick={() => agir(() => redefinirSenha(conta.user_id, senha),
                        `Senha de ${conta.nome} redefinida para ${senha}. Passe a ele e peça para trocá-la em "Minha conta".`)}>
                Definir senha
              </Button>
            </div>
          </div>
        )}
        <ErrorNote error={error} />
      </td>
    </tr>
  );
}

function LinhaSemAcesso({ conta, onMudou }: { conta: Conta; onMudou: (msg: string) => void }) {
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState<Papel>('cisp');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  return (
    <tr className={tabela.linha}>
      <td className={tabela.td}>
        <div className="font-medium text-tinta-900">{conta.email}</div>
        <div className="text-xs text-tinta-500">criada em {dataHora(conta.criado_em)}</div>
      </td>
      <td className={tabela.td}>
        <input className={`${inputClass} !py-1.5`} placeholder="Nome do servidor" value={nome}
               onChange={(e) => setNome(e.target.value)} aria-label="Nome" />
      </td>
      <td className={`${tabela.td} min-w-[140px]`}><SeletorPerfil valor={papel} onChange={setPapel} /></td>
      <td className={`${tabela.td} text-right`}>
        <Button className="!px-3 !py-1.5" disabled={busy || !nome.trim()}
                onClick={async () => {
                  setBusy(true); setError(null);
                  try { await definirAcesso(conta.user_id, nome.trim(), papel, false); onMudou(`Acesso dado a ${nome.trim()}.`); }
                  catch (err) { setError(err); } finally { setBusy(false); }
                }}>
          Dar acesso
        </Button>
        <ErrorNote error={error} />
      </td>
    </tr>
  );
}
