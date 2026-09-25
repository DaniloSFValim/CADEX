import { useEffect, useState } from 'react';
import { Button, Card, ErrorNote, Field, inputClass } from '../components/ui';
import { SituacaoBadge, dataBR } from '../components/Situacao';
import {
  SITUACAO_LABEL, hojeISO, listarHistorico, salvarInscricao, situacaoEfetiva, somaDias,
  type Empresa, type Historico, type InscricaoInput, type Situacao,
} from '../lib/empresas';

const paraInput = (e: Empresa): InscricaoInput => ({
  situacao: e.situacao,
  processo_numero: e.processo_numero ?? '',
  data_requerimento: e.data_requerimento ?? '',
  portaria_numero: e.portaria_numero ?? '',
  portaria_data: e.portaria_data ?? '',
  notificacao_data: e.notificacao_data ?? '',
});

/** O que cada situação exige, conforme a Resolução, para orientar quem preenche. */
const AJUDA: Record<Situacao, string> = {
  em_analise: 'Requerimento recebido; a SECONSER decide em 15 dias úteis (art. 7º).',
  apta: 'Exige o número e a data de publicação da portaria. Validade de 12 meses (art. 7º, § 1º).',
  em_saneamento: 'Empresa notificada por documento vencido; tem 30 dias para sanear e segue apta nesse prazo (art. 8º).',
  inapta: 'Só depois de 30 dias da notificação sem saneamento (art. 8º, § 1º). Não pode atuar.',
  indeferida: 'Requerimento em análise negado pela SECONSER (art. 7º).',
};

export function Inscricao({
  empresa, podeEditar, onSalvo,
}: { empresa: Empresa; podeEditar: boolean; onSalvo: () => Promise<void> }) {
  const [v, setV] = useState<InscricaoInput>(paraInput(empresa));
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => { setV(paraInput(empresa)); }, [empresa]);
  useEffect(() => { listarHistorico(empresa.id).then(setHistorico).catch(setError); }, [empresa]);

  const set = (k: keyof InscricaoInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setSalvo(false);
      setV((s) => ({ ...s, [k]: e.target.value }));
    };

  const hoje = hojeISO();
  const efetiva = situacaoEfetiva(empresa, hoje);
  const fimSaneamento = empresa.notificacao_data ? somaDias(empresa.notificacao_data, 30) : null;

  return (
    <Card title="Inscrição no CADEX" action={<SituacaoBadge s={efetiva} />}>
      <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">Portaria</dt><dd>{empresa.portaria_numero ?? '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Publicada em</dt><dd>{dataBR(empresa.portaria_data)}</dd></div>
        <div>
          <dt className="text-xs text-slate-500">Válida até</dt>
          <dd className={efetiva === 'vencida' ? 'font-medium text-red-700' : ''}>{dataBR(empresa.validade_ate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Fim do prazo de saneamento</dt>
          <dd>{empresa.situacao === 'em_saneamento' ? dataBR(fimSaneamento) : '—'}</dd>
        </div>
      </dl>
      {efetiva === 'vencida' && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">
          A validade de 12 meses terminou (art. 7º, § 1º). Registre a portaria de renovação para voltar a APTA.
        </p>
      )}

      {podeEditar && (
        <form
          className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setError(null); setSalvo(false);
            try { await salvarInscricao(empresa.id, v); await onSalvo(); setSalvo(true); }
            catch (err) { setError(err); }
            finally { setBusy(false); }
          }}
        >
          <Field label="Situação" className="sm:col-span-2" hint={AJUDA[v.situacao]}>
            <select id="insc-situacao" className={inputClass} value={v.situacao} onChange={set('situacao')}>
              {(Object.keys(AJUDA) as Situacao[]).map((s) => (
                <option key={s} value={s}>{SITUACAO_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Nº do processo administrativo" className="sm:col-span-2">
            <input id="insc-processo" className={inputClass} value={v.processo_numero ?? ''} onChange={set('processo_numero')} />
          </Field>
          <Field label="Data do requerimento" className="sm:col-span-2">
            <input id="insc-requerimento" type="date" className={inputClass} value={v.data_requerimento ?? ''}
                   onChange={set('data_requerimento')} />
          </Field>
          <Field label="Portaria (nº da publicação)" className="sm:col-span-2"
                 required={v.situacao === 'apta'}>
            <input id="insc-portaria" className={inputClass} placeholder="Ex.: Portaria SECONSER nº 12/2026"
                   value={v.portaria_numero ?? ''} onChange={set('portaria_numero')} />
          </Field>
          <Field label="Data de publicação" className="sm:col-span-2" required={v.situacao === 'apta'}
                 hint="A validade de 12 meses conta desta data.">
            <input id="insc-portaria-data" type="date" className={inputClass} value={v.portaria_data ?? ''}
                   onChange={set('portaria_data')} />
          </Field>
          <Field label="Data da notificação (art. 8º)" className="sm:col-span-2"
                 required={v.situacao === 'em_saneamento' || v.situacao === 'inapta'}>
            <input id="insc-notificacao" type="date" className={inputClass} value={v.notificacao_data ?? ''}
                   onChange={set('notificacao_data')} />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar inscrição'}</Button>
            {salvo && <span className="text-sm text-emerald-700">Inscrição salva.</span>}
          </div>
          <div className="sm:col-span-6"><ErrorNote error={error} /></div>
        </form>
      )}

      {historico.length > 0 && (
        <details className="mt-4 border-t border-slate-100 pt-3 text-sm">
          <summary className="cursor-pointer text-slate-700">Histórico ({historico.length})</summary>
          <ul className="mt-2 space-y-1 text-slate-600">
            {historico.map((h) => (
              <li key={h.id}>
                <span className="text-xs text-slate-500">{new Date(h.em).toLocaleString('pt-BR')}</span>{' — '}
                {h.de ? `${SITUACAO_LABEL[h.de]} → ` : ''}{SITUACAO_LABEL[h.para]}
                {h.portaria_numero && ` · ${h.portaria_numero} (${dataBR(h.portaria_data)})`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
