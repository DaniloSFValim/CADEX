import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Field, Spinner, inputClass, tabela } from '../components/ui';
import { useAuth, type Papel } from '../lib/auth';
import {
  PERFIS, SENHA_MINIMA, criarConta, definirAcesso, definirAtivo, excluirConta, gerarSenhaProvisoria, listarContas, redefinirSenha,
  vinculosDaConta, zerarMfa, type Conta, type VinculosDaConta,
} from '../lib/contas';

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca entrou';

/** Contas e acessos: aba da Administração. O título e as abas ficam na página que a envolve. */
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

  const comAcesso = (contas ?? []).filter((c) => c.papel && c.ativo);
  const desativados = (contas ?? []).filter((c) => c.papel && !c.ativo);
  const semAcesso = (contas ?? []).filter((c) => !c.papel);

  return (
    <>
      <div className="flex flex-col gap-10">
        <NovaConta onCriada={(msg) => { setAviso(msg); carregar(); }} />

        {aviso && (
          <div role="status" className="rounded-sm border-l-4 border-alta bg-alta/10 px-4 py-3 text-sm text-tinta-800">
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
                    <th className={tabela.th}>Duas etapas</th>
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

        {desativados.length > 0 && (
          <Card title={`Acesso desativado (${desativados.length})`} semPadding>
            <p className="border-b border-tinta-100 px-4 py-3 text-sm text-tinta-500">
              Não entram nem leem nada. O nome, o perfil e o histórico ficam guardados; reativar devolve o acesso como era.
            </p>
            <div className={tabela.moldura}>
              <table className={tabela.tabela}>
                <tbody>
                  {desativados.map((c) => (
                    <LinhaDesativada key={c.user_id} conta={c} onMudou={(msg) => { setAviso(msg); carregar(); }} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

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
          <SeletorPerfil valor={papel} onChange={(p) => { setPapel(p); if (p !== 'gestor') setAdministrador(false); }} completo />
        </Field>
        <Field label="Senha provisória" hint={`Pelo menos ${SENHA_MINIMA} caracteres. O servidor troca no primeiro acesso.`} required>
          <div className="flex gap-2">
            <input className={`${inputClass} tabular`} required minLength={SENHA_MINIMA} value={senha}
                   onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
            <Button variant="secondary" onClick={() => setSenha(gerarSenhaProvisoria())}>Gerar outra</Button>
          </div>
        </Field>
        <label className="flex items-start gap-2 text-sm text-tinta-700 md:col-span-2">
          <input type="checkbox" className="mt-0.5" checked={administrador} disabled={papel !== 'gestor'}
                 onChange={(e) => setAdministrador(e.target.checked)} />
          <span>
            <span className="font-medium">Administrador de contas</span>
            <span className="block text-tinta-500">
              Pode criar contas, mudar perfis e tirar acessos, inclusive de outros administradores. Só para o perfil SECONSER.
            </span>
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
  const [modo, setModo] = useState<'normal' | 'desativar' | 'senha' | 'zerar' | 'excluir'>('normal');
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
        <input className={`${inputClass} py-1.5!`} value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome" />
        <div className="mt-1 text-xs text-tinta-500">
          {conta.email}{ehVoce && <span className="ml-2"><Badge>você</Badge></span>}
        </div>
      </td>
      <td className={`${tabela.td} min-w-[140px]`}>
        <SeletorPerfil valor={papel} onChange={(p) => { setPapel(p); if (p !== 'gestor') setAdministrador(false); }} />
      </td>
      <td className={tabela.td}>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={administrador} disabled={ehVoce || papel !== 'gestor'}
                 onChange={(e) => setAdministrador(e.target.checked)} />
          {administrador ? 'Sim' : 'Não'}
        </label>
        {ehVoce && <div className="text-xs text-tinta-500">outro administrador altera</div>}
      </td>
      <td className={tabela.td}>
        {conta.mfa_ativa
          ? <Badge tom="bom">Ativa</Badge>
          : conta.papel === 'gestor'
            ? <Badge tom="alerta">Cadastra no próximo acesso</Badge>
            : <span className="text-xs text-tinta-500">não exigida</span>}
      </td>
      <td className={`${tabela.td} tabular whitespace-nowrap text-xs text-tinta-600`}>{dataHora(conta.ultimo_acesso)}</td>
      <td className={`${tabela.td} min-w-[260px]`}>
        {modo === 'normal' && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button className="px-3! py-1.5!" disabled={!alterado || busy}
                    onClick={() => agir(() => definirAcesso(conta.user_id, nome.trim(), papel, administrador),
                      `Acesso de ${nome.trim()} atualizado.`)}>
              Salvar
            </Button>
            <Button variant="secondary" className="px-3! py-1.5!"
                    onClick={() => { setSenha(gerarSenhaProvisoria()); setModo('senha'); }}>
              Redefinir senha
            </Button>
            {!ehVoce && conta.mfa_ativa && (
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => setModo('zerar')}>Zerar duas etapas</Button>
            )}
            {!ehVoce && (
              <Button variant="danger" className="px-3! py-1.5!" onClick={() => setModo('desativar')}>Desativar acesso</Button>
            )}
            {!ehVoce && (
              <Button variant="danger" className="px-3! py-1.5!" onClick={() => setModo('excluir')}>Excluir usuário</Button>
            )}
          </div>
        )}
        {modo === 'desativar' && (
          <div className="flex flex-col items-end gap-2 text-right text-sm">
            <span className="text-tinta-700">
              {conta.nome} deixa de entrar e de ler qualquer dado, mesmo com a sessão aberta. O cadastro e o histórico ficam guardados e dá para reativar.
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => setModo('normal')}>Cancelar</Button>
              <Button variant="danger" className="px-3! py-1.5!" disabled={busy}
                      onClick={() => agir(() => definirAtivo(conta.user_id, false), `Acesso de ${conta.nome} desativado.`)}>
                Confirmar desativação
              </Button>
            </div>
          </div>
        )}
        {modo === 'excluir' && (
          <PainelExclusao conta={conta} onCancelar={() => setModo('normal')} onExcluida={onMudou} />
        )}
        {modo === 'zerar' && (
          <div className="flex flex-col items-end gap-2 text-right text-sm">
            <span className="text-tinta-700">
              Use quando {conta.nome} perder ou trocar de celular. No próximo acesso, ele cadastra o aplicativo de novo.
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => setModo('normal')}>Cancelar</Button>
              <Button className="px-3! py-1.5!" disabled={busy}
                      onClick={() => agir(() => zerarMfa(conta.user_id),
                        `Verificação em duas etapas de ${conta.nome} zerada. No próximo acesso, ele cadastra o aplicativo de novo.`)}>
                Confirmar
              </Button>
            </div>
          </div>
        )}
        {modo === 'senha' && (
          <div className="flex flex-col items-end gap-2">
            <input className={`${inputClass} tabular py-1.5!`} value={senha} minLength={SENHA_MINIMA}
                   onChange={(e) => setSenha(e.target.value)} aria-label="Nova senha provisória" />
            <div className="flex gap-2">
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => setModo('normal')}>Cancelar</Button>
              <Button className="px-3! py-1.5!" disabled={busy || senha.length < SENHA_MINIMA}
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

function LinhaDesativada({ conta, onMudou }: { conta: Conta; onMudou: (msg: string) => void }) {
  const [excluindo, setExcluindo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <tr className={tabela.linha}>
      <td className={tabela.td}>
        <div className="font-medium text-tinta-900">{conta.nome}</div>
        <div className="text-xs text-tinta-500">{conta.email}</div>
      </td>
      <td className={tabela.td}>{PERFIS.find((p) => p.valor === conta.papel)?.rotulo ?? conta.papel}</td>
      <td className={`${tabela.td} tabular whitespace-nowrap text-xs text-tinta-600`}>{dataHora(conta.ultimo_acesso)}</td>
      <td className={`${tabela.td} text-right`}>
        <Button variant="secondary" className="px-3! py-1.5!" disabled={busy}
                onClick={async () => {
                  setBusy(true); setError(null);
                  try { await definirAtivo(conta.user_id, true); onMudou(`Acesso de ${conta.nome} reativado.`); }
                  catch (err) { setError(err); } finally { setBusy(false); }
                }}>
          Reativar acesso
        </Button>{' '}
        <Button variant="danger" className="px-3! py-1.5!" onClick={() => setExcluindo(true)}>Excluir usuário</Button>
        {excluindo && <PainelExclusao conta={conta} onCancelar={() => setExcluindo(false)} onExcluida={onMudou} />}
        <ErrorNote error={error} />
      </td>
    </tr>
  );
}

function LinhaSemAcesso({ conta, onMudou }: { conta: Conta; onMudou: (msg: string) => void }) {
  const [excluindo, setExcluindo] = useState(false);
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
        <input className={`${inputClass} py-1.5!`} placeholder="Nome do servidor" value={nome}
               onChange={(e) => setNome(e.target.value)} aria-label="Nome" />
      </td>
      <td className={`${tabela.td} min-w-[140px]`}><SeletorPerfil valor={papel} onChange={setPapel} /></td>
      <td className={`${tabela.td} text-right`}>
        <Button className="px-3! py-1.5!" disabled={busy || !nome.trim()}
                onClick={async () => {
                  setBusy(true); setError(null);
                  try { await definirAcesso(conta.user_id, nome.trim(), papel, false); onMudou(`Acesso dado a ${nome.trim()}.`); }
                  catch (err) { setError(err); } finally { setBusy(false); }
                }}>
          Dar acesso
        </Button>{' '}
        <Button variant="danger" className="px-3! py-1.5!" onClick={() => setExcluindo(true)}>Excluir usuário</Button>
        {excluindo && <PainelExclusao conta={conta} onCancelar={() => setExcluindo(false)} onExcluida={onMudou} />}
        <ErrorNote error={error} />
      </td>
    </tr>
  );
}

/**
 * Confirmação da exclusão de usuário: mostra quem é, o que a conta tem de registros e o que acontece,
 * e só exclui depois de digitar o e-mail da conta. A autorização é conferida no banco, não aqui.
 */
function PainelExclusao({ conta, onCancelar, onExcluida }: {
  conta: Conta; onCancelar: () => void; onExcluida: (msg: string) => void;
}) {
  const [vinculos, setVinculos] = useState<VinculosDaConta | null>(null);
  const [digitado, setDigitado] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const quem = conta.nome ?? conta.email;

  useEffect(() => { vinculosDaConta(conta.user_id).then(setVinculos).catch(setError); }, [conta.user_id]);

  const confirmar = async () => {
    setBusy(true); setError(null);
    try { await excluirConta(conta.user_id); onExcluida(`Usuário ${quem} excluído. O acesso foi removido e a conta de login apagada.`); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div role="group" aria-label="Confirmar exclusão do usuário"
         className="mt-3 w-full max-w-md rounded-sm border border-baixa/40 bg-baixa/4 p-4 text-left text-sm">
      <dl className="grid gap-1">
        <div className="flex gap-2"><dt className="w-24 flex-none text-tinta-500">Nome</dt><dd>{conta.nome ?? 'Sem acesso ao CADEX'}</dd></div>
        <div className="flex gap-2"><dt className="w-24 flex-none text-tinta-500">E-mail</dt><dd className="min-w-0 break-all">{conta.email}</dd></div>
        <div className="flex gap-2"><dt className="w-24 flex-none text-tinta-500">Perfil</dt>
          <dd>{PERFIS.find((p) => p.valor === conta.papel)?.rotulo ?? '—'}{conta.administrador && ', administrador'}</dd></div>
        <div className="flex gap-2"><dt className="w-24 flex-none text-tinta-500">Último acesso</dt><dd>{dataHora(conta.ultimo_acesso)}</dd></div>
      </dl>
      <p className="mt-3 text-tinta-700">
        A conta de login é apagada e o acesso ao CADEX, removido na hora, mesmo com a sessão aberta. <strong>Não dá para desfazer.</strong>{' '}
        O que {quem} fez continua na auditoria, com o nome.
        {vinculos && (vinculos.documentos_enviados + vinculos.mudancas_de_situacao > 0) && (
          <> {vinculos.documentos_enviados > 0 && `${vinculos.documentos_enviados} documento${vinculos.documentos_enviados === 1 ? '' : 's'} enviado${vinculos.documentos_enviados === 1 ? '' : 's'}`}
            {vinculos.documentos_enviados > 0 && vinculos.mudancas_de_situacao > 0 && ' e '}
            {vinculos.mudancas_de_situacao > 0 && `${vinculos.mudancas_de_situacao} mudança${vinculos.mudancas_de_situacao === 1 ? '' : 's'} de situação`} perdem o campo "enviado por" / "feito por".</>
        )}
      </p>
      {vinculos && <p className="mt-1 text-xs text-tinta-500">{vinculos.eventos_auditoria} evento{vinculos.eventos_auditoria === 1 ? '' : 's'} na auditoria.</p>}
      <Field label="Para confirmar, digite o e-mail da conta" className="mt-3">
        <input className={inputClass} value={digitado} onChange={(e) => setDigitado(e.target.value)} autoComplete="off" />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" className="px-3! py-1.5!" onClick={onCancelar}>Cancelar</Button>
        <Button variant="danger" className="px-3! py-1.5!"
                disabled={busy || !vinculos || digitado.trim().toLowerCase() !== conta.email.toLowerCase()}
                onClick={() => void confirmar()}>
          {busy ? 'Excluindo…' : 'Confirmar exclusão'}
        </Button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}
