import { useEffect, useState } from 'react';
import { Button, Card, ErrorNote, Field, inputClass } from '../components/ui';
import { SituacaoBadge, dataBR } from '../components/Situacao';
import {
  SITUACAO_LABEL, hojeISO, listarDocumentos, listarHistorico, listarTiposDocumento, resumoDocumentos,
  salvarInscricao, situacaoEfetiva, somaDias, tiposDaEmpresa,
  type Documento, type Empresa, type Historico, type InscricaoInput, type Situacao, type TipoDocumento,
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
  em_analise: 'Requerimento recebido. Prazo de análise: 15 dias úteis.',
  deferida: 'Documentos completos; já habilitada a atuar. Publique a portaria para tornar APTA.',
  apta: 'Informe a portaria e a data de publicação. Vale por 12 meses.',
  em_saneamento: 'Notificada por pendência. Continua apta por 30 dias para regularizar.',
  inapta: 'Após 30 dias da notificação sem regularização. Não pode atuar.',
};

export function Inscricao({
  empresa, podeEditar, onSalvo,
}: { empresa: Empresa; podeEditar: boolean; onSalvo: () => Promise<void> }) {
  const [v, setV] = useState<InscricaoInput>(paraInput(empresa));
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => { setV(paraInput(empresa)); }, [empresa]);
  useEffect(() => { listarHistorico(empresa.id).then(setHistorico).catch(setError); }, [empresa]);
  // Completude documental, para orientar a decisão de deferir (não a automatiza).
  useEffect(() => {
    Promise.all([listarTiposDocumento(), listarDocumentos(empresa.id)])
      .then(([t, d]) => { setTipos(tiposDaEmpresa(t, empresa)); setDocs(d); })
      .catch(setError);
  }, [empresa]);

  const set = (k: keyof InscricaoInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setSalvo(false);
      setV((s) => ({ ...s, [k]: e.target.value }));
    };

  const hoje = hojeISO();
  const efetiva = situacaoEfetiva(empresa, hoje);
  const fimSaneamento = empresa.notificacao_data ? somaDias(empresa.notificacao_data, 30) : null;

  const obrigatorios = tipos.filter((t) => t.obrigatorio).length;
  const faltando = resumoDocumentos(tipos, docs, hoje).faltando;
  const entregues = obrigatorios - faltando;

  return (
    <Card title="Inscrição no CADEX" action={<SituacaoBadge s={efetiva} />}>
      <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-tinta-500">Portaria</dt><dd>{empresa.portaria_numero ?? '—'}</dd></div>
        <div><dt className="text-xs text-tinta-500">Publicada em</dt><dd>{dataBR(empresa.portaria_data)}</dd></div>
        <div>
          <dt className="text-xs text-tinta-500">Válida até</dt>
          <dd className={efetiva === 'vencida' ? 'font-medium text-baixa' : ''}>{dataBR(empresa.validade_ate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-tinta-500">Fim do prazo de saneamento</dt>
          <dd>{empresa.situacao === 'em_saneamento' ? dataBR(fimSaneamento) : '—'}</dd>
        </div>
      </dl>

      {obrigatorios > 0 && (
        <p className={`mb-4 rounded-sm px-3 py-2 text-sm ring-1 ring-inset ${
          faltando === 0
            ? 'bg-alta/10 text-alta ring-alta/30'
            : 'bg-atencao/10 text-atencao ring-atencao/30'
        }`}>
          {faltando === 0
            ? `Todos os ${obrigatorios} documentos obrigatórios foram entregues — pronta para deferir.`
            : `${entregues} de ${obrigatorios} documentos obrigatórios entregues. ${
                faltando === 1 ? 'Falta 1' : `Faltam ${faltando}`} — confira em Documentos antes de deferir.`}
        </p>
      )}

      {efetiva === 'vencida' && (
        <p className="mb-4 rounded-sm bg-baixa/10 px-3 py-2 text-sm text-baixa ring-1 ring-inset ring-baixa/30">
          Inscrição vencida. Registre a portaria de renovação.
        </p>
      )}

      {podeEditar && (
        <form
          className="grid gap-4 border-t border-tinta-100 pt-4 sm:grid-cols-6"
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
                <option key={s} value={s} disabled={(s === 'deferida' || s === 'apta') && faltando > 0}>
                  {SITUACAO_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nº do processo" className="sm:col-span-2">
            <input id="insc-processo" className={inputClass} value={v.processo_numero ?? ''} onChange={set('processo_numero')} />
          </Field>
          <Field label="Data do requerimento" className="sm:col-span-2">
            <input id="insc-requerimento" type="date" className={inputClass} value={v.data_requerimento ?? ''}
                   onChange={set('data_requerimento')} />
          </Field>
          <Field label="Portaria" className="sm:col-span-2"
                 required={v.situacao === 'apta'}>
            <input id="insc-portaria" className={inputClass} placeholder="Portaria SECONSER nº 12/2026"
                   value={v.portaria_numero ?? ''} onChange={set('portaria_numero')} />
          </Field>
          <Field label="Data de publicação" className="sm:col-span-2" required={v.situacao === 'apta'}
                 hint="A validade conta desta data.">
            <input id="insc-portaria-data" type="date" className={inputClass} value={v.portaria_data ?? ''}
                   onChange={set('portaria_data')} />
          </Field>
          <Field label="Data da notificação" className="sm:col-span-2"
                 required={v.situacao === 'em_saneamento' || v.situacao === 'inapta'}>
            <input id="insc-notificacao" type="date" className={inputClass} value={v.notificacao_data ?? ''}
                   onChange={set('notificacao_data')} />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar inscrição'}</Button>
            <button type="button" className="text-sm font-semibold text-tinta-600 hover:underline"
                    onClick={() => { setV(paraInput(empresa)); setError(null); }}>Cancelar</button>
            {salvo && <span className="text-sm text-alta">Inscrição salva.</span>}
          </div>
          <div className="sm:col-span-6"><ErrorNote error={error} /></div>
        </form>
      )}

      {historico.length > 0 && (
        <details className="mt-4 border-t border-tinta-100 pt-3 text-sm">
          <summary className="cursor-pointer text-tinta-700">Histórico ({historico.length})</summary>
          <ul className="mt-2 space-y-1 text-tinta-600">
            {historico.map((h) => (
              <li key={h.id}>
                <span className="mr-2 text-xs text-tinta-500">{new Date(h.em).toLocaleString('pt-BR')}</span>
                {h.de ? `${SITUACAO_LABEL[h.de]} → ` : ''}{SITUACAO_LABEL[h.para]}
                {h.portaria_numero && `, ${h.portaria_numero} (${dataBR(h.portaria_data)})`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
