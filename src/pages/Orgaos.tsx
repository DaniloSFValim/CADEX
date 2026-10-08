import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Field, Spinner, Titulo, inputClass, tabela } from '../components/ui';
import { formatCnpj, isValidCnpj } from '../lib/cnpj';
import { SETORES, SETOR_LABEL, type Setor } from '../lib/empresas';
import { useAuth } from '../lib/auth';
import {
  ESFERAS, ESFERA_LABEL, listarOrgaos, nomeOrgao, removerOrgao, salvarOrgao,
  type Esfera, type Orgao,
} from '../lib/orgaos';

interface Form { nome: string; sigla: string; esfera: Esfera; cnpj: string; setores: Setor[] }
const VAZIO: Form = { nome: '', sigla: '', esfera: 'municipal', cnpj: '', setores: [] };

export default function Orgaos() {
  const { podeEditar } = useAuth();
  const [orgaos, setOrgaos] = useState<Orgao[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const carregar = useCallback(() => { listarOrgaos().then(setOrgaos).catch(setError); }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <>
      <Titulo
        titulo="Órgãos públicos"
        descricao="A administração que contrata obras diretamente (SEMOB, uma secretaria, etc.). Entra como contratante da licença — não se inscreve no CADEX: sem documentos, validade ou código."
      />

      <div className="flex flex-col gap-10">
        {podeEditar && <OrgaoForm onSalvo={carregar} />}

        <Card title={`Cadastrados (${orgaos?.length ?? 0})`} semPadding>
          <ErrorNote error={error} />
          {!orgaos && !error && <Spinner />}
          {orgaos && orgaos.length === 0 && <Empty>Nenhum órgão cadastrado.</Empty>}
          {orgaos && orgaos.length > 0 && (
            <div className={tabela.moldura}>
              <table className={tabela.tabela}>
                <thead className={tabela.cabeca}>
                  <tr>
                    <th className={tabela.th}>Órgão</th>
                    <th className={tabela.th}>Esfera</th>
                    <th className={tabela.th}>Setores</th>
                    <th className={tabela.th}>CNPJ</th>
                    {podeEditar && <th className={tabela.th}><span className="sr-only">Ações</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {orgaos.map((o) => (
                    <LinhaOrgao key={o.id} orgao={o} podeEditar={podeEditar} onMudou={carregar} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function SetoresCheck({ valor, onChange }: { valor: Setor[]; onChange: (s: Setor[]) => void }) {
  const alterna = (s: Setor) =>
    onChange(valor.includes(s) ? valor.filter((x) => x !== s) : [...valor, s]);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {SETORES.map((s) => (
        <label key={s} className="inline-flex items-center gap-2 text-sm text-tinta-700">
          <input type="checkbox" checked={valor.includes(s)} onChange={() => alterna(s)} />
          {SETOR_LABEL[s]}
        </label>
      ))}
    </div>
  );
}

function CamposOrgao({ f, set }: { f: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  return (
    <>
      <Field label="Nome" required>
        <input className={inputClass} required value={f.nome} onChange={(e) => set('nome', e.target.value)} />
      </Field>
      <Field label="Sigla" hint="Ex.: SEMOB. Aparece junto ao nome.">
        <input className={inputClass} value={f.sigla} onChange={(e) => set('sigla', e.target.value)} />
      </Field>
      <Field label="Esfera" required>
        <select className={inputClass} value={f.esfera} onChange={(e) => set('esfera', e.target.value as Esfera)}>
          {ESFERAS.map((es) => <option key={es} value={es}>{ESFERA_LABEL[es]}</option>)}
        </select>
      </Field>
      <Field label="CNPJ" hint="Opcional.">
        <input className={inputClass} value={f.cnpj} onChange={(e) => set('cnpj', formatCnpj(e.target.value))} />
      </Field>
      <Field label="Setores em que contrata" hint="Em branco = qualquer setor." className="sm:col-span-2">
        <SetoresCheck valor={f.setores} onChange={(s) => set('setores', s)} />
      </Field>
    </>
  );
}

/** Mensagem de erro de validação, ou null se os campos estão bons. */
function validar(f: Form): string | null {
  if (!f.nome.trim()) return 'Informe o nome do órgão.';
  if (f.cnpj.trim() && !isValidCnpj(f.cnpj)) return 'CNPJ inválido.';
  return null;
}

function OrgaoForm({ onSalvo }: { onSalvo: () => void }) {
  const [f, setF] = useState<Form>(VAZIO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <Card title="Novo órgão">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const msg = validar(f);
          if (msg) { setError(new Error(msg)); return; }
          setBusy(true); setError(null);
          try {
            await salvarOrgao({ nome: f.nome, sigla: f.sigla, esfera: f.esfera, cnpj: f.cnpj, setores: f.setores });
            setF(VAZIO); onSalvo();
          } catch (err) { setError(err); } finally { setBusy(false); }
        }}
      >
        <CamposOrgao f={f} set={set} />
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Cadastrar órgão'}</Button>
          <ErrorNote error={error} />
        </div>
      </form>
    </Card>
  );
}

function LinhaOrgao({ orgao, podeEditar, onMudou }: { orgao: Orgao; podeEditar: boolean; onMudou: () => void }) {
  const [modo, setModo] = useState<'normal' | 'editar' | 'remover'>('normal');
  const [f, setF] = useState<Form>(() => paraForm(orgao));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const agir = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); setModo('normal'); onMudou(); } catch (err) { setError(err); } finally { setBusy(false); }
  };

  if (modo === 'editar') {
    return (
      <tr className={tabela.linha}>
        <td className={tabela.td} colSpan={podeEditar ? 5 : 4}>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const msg = validar(f);
              if (msg) { setError(new Error(msg)); return; }
              void agir(() => salvarOrgao({ nome: f.nome, sigla: f.sigla, esfera: f.esfera, cnpj: f.cnpj, setores: f.setores }, orgao.id));
            }}
          >
            <CamposOrgao f={f} set={set} />
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
              <Button variant="secondary" onClick={() => { setF(paraForm(orgao)); setModo('normal'); }}>Cancelar</Button>
              <ErrorNote error={error} />
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={tabela.linha}>
      <td className={tabela.td}>
        <div className="font-medium text-tinta-900">{nomeOrgao(orgao)}</div>
      </td>
      <td className={tabela.td}>{ESFERA_LABEL[orgao.esfera]}</td>
      <td className={tabela.td}>
        {orgao.setores.length
          ? <div className="flex flex-wrap gap-1">{orgao.setores.map((s) => <Badge key={s}>{SETOR_LABEL[s]}</Badge>)}</div>
          : <span className="text-tinta-500">Qualquer</span>}
      </td>
      <td className={`${tabela.td} tabular whitespace-nowrap`}>{orgao.cnpj ? formatCnpj(orgao.cnpj) : '—'}</td>
      {podeEditar && (
        <td className={`${tabela.td} min-w-[220px]`}>
          {modo === 'normal' && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" className="px-3! py-1.5!" onClick={() => { setF(paraForm(orgao)); setModo('editar'); }}>Editar</Button>
              <Button variant="danger" className="px-3! py-1.5!" onClick={() => setModo('remover')}>Remover</Button>
            </div>
          )}
          {modo === 'remover' && (
            <div className="flex flex-col items-end gap-2 text-right text-sm">
              <span className="text-tinta-700">Remover {nomeOrgao(orgao)}? Licenças já ligadas a ele impedem a remoção.</span>
              <div className="flex gap-2">
                <Button variant="secondary" className="px-3! py-1.5!" onClick={() => setModo('normal')}>Cancelar</Button>
                <Button variant="danger" className="px-3! py-1.5!" disabled={busy} onClick={() => void agir(() => removerOrgao(orgao.id))}>
                  Confirmar
                </Button>
              </div>
              <ErrorNote error={error} />
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

const paraForm = (o: Orgao): Form => ({
  nome: o.nome, sigla: o.sigla ?? '', esfera: o.esfera, cnpj: o.cnpj ? formatCnpj(o.cnpj) : '', setores: o.setores,
});
