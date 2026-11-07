import { useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Field, Spinner, inputClass, tabela } from './ui';
import { dataBR } from './Situacao';
import { listarEmpresas, type Empresa } from '../lib/empresas';
import {
  SENHA_MINIMA, criarRepresentante, definirRepresentanteAtivo, gerarSenhaProvisoria, listarRepresentantes, type Representante,
} from '../lib/contas';

const ROTULO_PAPEL: Record<Representante['papel'], string> = { representante: 'Representante', operador: 'Operador' };

/**
 * Acessos de empresa ao portal. Só a SECONSER cadastra: o representante é validado pelo servidor
 * antes de receber a senha provisória. Sem acesso de servidor, a empresa não entra em nada.
 */
export function RepresentantesEmpresa() {
  const [lista, setLista] = useState<Representante[] | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [empresaId, setEmpresaId] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Representante['papel']>('representante');
  const [senha, setSenha] = useState(gerarSenhaProvisoria);

  const carregar = () => listarRepresentantes().then(setLista).catch(setErro);
  useEffect(() => {
    void carregar();
    listarEmpresas().then((e) => setEmpresas(e.filter((x) => x.ativa))).catch(setErro);
  }, []);

  const cadastrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErro(null); setAviso(null);
    try {
      await criarRepresentante({ empresa_id: empresaId, nome: nome.trim(), email: email.trim(), papel, senha });
      const empresa = empresas.find((x) => x.id === empresaId);
      setAviso(`Acesso criado para ${nome.trim()} (${empresa?.razao_social ?? 'empresa'}). Passe o e-mail ${email.trim()} e a senha provisória ${senha}. Ele troca a senha e cadastra o aplicativo de verificação no primeiro acesso.`);
      setNome(''); setEmail(''); setPapel('representante'); setSenha(gerarSenhaProvisoria());
      setAberto(false);
      await carregar();
    } catch (err) {
      setErro(err);
    } finally {
      setBusy(false);
    }
  };

  const alternar = async (r: Representante) => {
    setErro(null); setAviso(null);
    try {
      await definirRepresentanteAtivo(r.user_id, !r.ativo);
      setAviso(r.ativo ? `Acesso de ${r.nome} desativado. Ele deixa de entrar e de ver qualquer dado, mesmo com a sessão aberta.` : `Acesso de ${r.nome} reativado.`);
      await carregar();
    } catch (err) {
      setErro(err);
    }
  };

  return (
    <Card title={`Acessos de empresas (${lista?.length ?? 0})`} semPadding>
      <div className="space-y-4 p-4">
        <p className="text-sm text-tinta-600">
          Representantes de empresas no portal das empresas. Só cadastre quem a empresa indicou, depois de conferir a representação.
          Empresa desativada não recebe novo acesso.
        </p>
        {aviso && <p role="status" className="rounded-sm border-l-4 border-alta bg-alta/10 px-3 py-2 text-sm text-tinta-800">{aviso}</p>}
        {!aberto ? (
          <Button onClick={() => { setAberto(true); setAviso(null); }}>Novo acesso de empresa</Button>
        ) : (
          <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => void cadastrar(e)}>
            <Field label="Empresa" required>
              <select className={inputClass} required value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
                <option value="">Escolha a empresa</option>
                {empresas.map((x) => <option key={x.id} value={x.id}>{x.razao_social} ({x.codigo_cadex})</option>)}
              </select>
            </Field>
            <Field label="Papel" required>
              <select className={inputClass} value={papel} onChange={(e) => setPapel(e.target.value as Representante['papel'])}>
                <option value="representante">Representante</option>
                <option value="operador">Operador</option>
              </select>
            </Field>
            <Field label="Nome do representante" required>
              <input className={inputClass} required value={nome} onChange={(e) => setNome(e.target.value)} />
            </Field>
            <Field label="E-mail" required>
              <input type="email" className={inputClass} required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Senha provisória" hint={`Pelo menos ${SENHA_MINIMA} caracteres.`} required>
              <div className="flex gap-2">
                <input className={`${inputClass} tabular`} required minLength={SENHA_MINIMA} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
                <Button variant="secondary" className="whitespace-nowrap" onClick={() => setSenha(gerarSenhaProvisoria())}>Gerar outra</Button>
              </div>
            </Field>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? 'Criando…' : 'Criar acesso'}</Button>
              <Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
            </div>
          </form>
        )}
        <ErrorNote error={erro} />
      </div>

      {!lista ? <Spinner /> : lista.length === 0 ? <Empty>Nenhum acesso de empresa cadastrado.</Empty> : (
        <div className={tabela.moldura}>
          <table className={tabela.tabela}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.th}>Empresa</th>
                <th className={tabela.th}>Representante</th>
                <th className={tabela.th}>Papel</th>
                <th className={tabela.th}>Acesso</th>
                <th className={tabela.th}><span className="sr-only">Ação</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.user_id} className={tabela.linha}>
                  <td className={tabela.td}>
                    <div className="font-medium text-tinta-900">{r.empresas?.razao_social ?? '—'}</div>
                    <div className="text-xs text-tinta-500">{r.empresas?.codigo_cadex}</div>
                  </td>
                  <td className={tabela.td}>
                    <div className="text-tinta-900">{r.nome}</div>
                    <div className="text-xs text-tinta-500">{r.email}</div>
                  </td>
                  <td className={tabela.td}>{ROTULO_PAPEL[r.papel]}</td>
                  <td className={tabela.td}>
                    {r.ativo ? <Badge tom="bom">Ativo</Badge> : <Badge tom="alerta">Desativado em {dataBR(r.desativado_em)}</Badge>}
                  </td>
                  <td className={`${tabela.td} text-right`}>
                    <Button variant="secondary" className="px-3! py-1.5!" onClick={() => void alternar(r)}>
                      {r.ativo ? 'Desativar' : 'Reativar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
