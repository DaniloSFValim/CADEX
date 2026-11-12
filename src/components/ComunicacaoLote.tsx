import { useState } from 'react';
import { Button, ErrorNote, Field, inputClass } from './ui';
import { hojeISO } from '../lib/empresas';
import { PRAZO_EMERGENCIA_HORAS, TIPO_COMUNICACAO_LABEL, normalizarPlacas, type TipoComunicacao } from '../lib/comunicacoes';
import { criarComunicacoesEmLote } from '../lib/comunicacoes';
import { interpretarLote, montarLote, type ErroLote } from '../lib/comunicacoesLote';

const EXEMPLO = '-22.900000; -43.120000; Manutenção de rede\n-22.905000; -43.125000; Troca de poste';

/**
 * Cadastro em lote: os dados comuns valem para todos os locais, e cada linha traz um ponto
 * (latitude; longitude) e o tipo de serviço. Tudo é validado antes; a gravação é tudo ou nada.
 */
export default function ComunicacaoLote({ empresaId, onRegistrado }: { empresaId: string; onRegistrado: () => Promise<void> | void }) {
  const [tipo, setTipo] = useState<TipoComunicacao>('programado');
  const [responsavel, setResponsavel] = useState('');
  const [placasTexto, setPlacasTexto] = useState('');
  const [local, setLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [ocorrido, setOcorrido] = useState('');
  const [protocolo, setProtocolo] = useState('');
  const [linhas, setLinhas] = useState('');
  const [erros, setErros] = useState<ErroLote[]>([]);
  const [prontas, setProntas] = useState<number | null>(null);
  const [problema, setProblema] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const emergencia = tipo === 'emergencia';

  const base = () => ({
    empresa_id: empresaId,
    tipo,
    responsavel,
    placas: normalizarPlacas(placasTexto),
    local_servico: local,
    descricao,
    inicio_previsto: emergencia ? '' : inicio,
    fim_previsto: fim,
    ocorrido_em: emergencia && ocorrido ? new Date(ocorrido).toISOString() : null,
    protocolo_cisp: emergencia ? protocolo : null,
  });

  /** Confere o texto e as regras de cada linha, sem gravar. */
  const verificar = () => {
    setAviso(null); setProblema(null);
    const lidas = interpretarLote(linhas);
    if (lidas.linhas.length === 0 && lidas.erros.length === 0) {
      setErros([]); setProntas(0); setProblema(new Error('Cole ao menos uma linha: latitude; longitude; tipo de serviço.'));
      return null;
    }
    const b = base();
    if (!b.responsavel.trim()) { setErros([]); setProntas(0); setProblema(new Error('Informe o responsável pelo serviço.')); return null; }
    const monta = montarLote(lidas.linhas, b, hojeISO(), new Date());
    const todosErros = [...lidas.erros, ...monta.erros].sort((x, y) => x.numero - y.numero);
    setErros(todosErros);
    setProntas(monta.comunicacoes.length);
    return todosErros.length === 0 ? monta.comunicacoes : null;
  };

  const registrar = async () => {
    const comunicacoes = verificar();
    if (!comunicacoes || comunicacoes.length === 0) return;
    setBusy(true);
    try {
      await criarComunicacoesEmLote(comunicacoes);
      setAviso(`${comunicacoes.length} ${comunicacoes.length === 1 ? 'comunicação registrada' : 'comunicações registradas'} em lote.`);
      setLinhas(''); setErros([]); setProntas(null);
      await onRegistrado();
    } catch (e) {
      setProblema(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Cadastro em lote" className="mt-6 border-t border-tinta-200 pt-5">
      <h3 className="mb-1 font-display text-lg font-bold text-tinta-900">Cadastrar vários locais de uma vez</h3>
      <p className="mb-4 text-sm text-tinta-600">
        Os dados comuns valem para todos os locais. Cada linha tem um ponto e o tipo de serviço:
        <span className="tabular"> latitude; longitude; tipo de serviço</span>.
        {emergencia && ` Emergência: registro em até ${PRAZO_EMERGENCIA_HORAS} horas do fato.`}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-2">
          <legend className="mb-1 text-sm font-medium text-tinta-800">Tipo de comunicação</legend>
          {(['programado', 'emergencia'] as const).map((t) => (
            <label key={t} className="inline-flex items-center gap-2 text-sm text-tinta-800">
              <input type="radio" name="tipo-lote" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="accent-marca-600" />
              {TIPO_COMUNICACAO_LABEL[t]}
            </label>
          ))}
        </fieldset>
        <Field label="Responsável" required>
          <input className={inputClass} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        </Field>
        <Field label="Placas dos veículos" required hint="Separe por vírgula.">
          <input className={`${inputClass} tabular`} value={placasTexto} onChange={(e) => setPlacasTexto(e.target.value)} />
        </Field>
        <Field label="Local do serviço" required hint="Rua, bairro ou referência comum.">
          <input className={inputClass} value={local} onChange={(e) => setLocal(e.target.value)} />
        </Field>
        <Field label="Descrição do serviço" required>
          <input className={inputClass} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
        {emergencia ? (
          <>
            <Field label="Data e hora do fato" required>
              <input type="datetime-local" className={inputClass} value={ocorrido} onChange={(e) => setOcorrido(e.target.value)} />
            </Field>
            <Field label="Protocolo do 153" hint="Opcional.">
              <input className={`${inputClass} tabular`} value={protocolo} onChange={(e) => setProtocolo(e.target.value)} />
            </Field>
            <Field label="Previsão de término" required>
              <input type="date" className={inputClass} value={fim} onChange={(e) => setFim(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Início previsto" required>
              <input type="date" className={inputClass} min={hojeISO()} value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </Field>
            <Field label="Fim previsto" required>
              <input type="date" className={inputClass} min={inicio || hojeISO()} value={fim} onChange={(e) => setFim(e.target.value)} />
            </Field>
          </>
        )}
        <div className="md:col-span-2">
          <label htmlFor="locais-lote" className="mb-1 block text-sm font-medium text-tinta-800">Locais (um por linha)</label>
          <textarea id="locais-lote" rows={6} className={`${inputClass} tabular`} placeholder={EXEMPLO} value={linhas}
                    onChange={(e) => setLinhas(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={verificar}>Verificar linhas</Button>
        <Button disabled={busy || prontas === null || prontas === 0 || erros.length > 0} onClick={() => void registrar()}>
          {busy ? 'Registrando…' : `Registrar ${prontas ?? 0} ${prontas === 1 ? 'comunicação' : 'comunicações'}`}
        </Button>
        {prontas !== null && erros.length === 0 && prontas > 0 && (
          <span className="text-sm text-tinta-700">Tudo certo: {prontas} {prontas === 1 ? 'local pronto' : 'locais prontos'} para registrar.</span>
        )}
      </div>

      {aviso && <p role="status" className="mt-4 rounded-sm border-l-4 border-alta bg-alta/10 px-3 py-2 text-sm text-tinta-800">{aviso}</p>}
      {erros.length > 0 && (
        <div role="alert" className="mt-4 rounded-sm border-l-4 border-baixa bg-baixa/5 px-3 py-2 text-sm text-tinta-800">
          <p className="font-semibold">Nenhuma comunicação foi registrada. Corrija as linhas abaixo:</p>
          <ul className="mt-1 list-disc pl-5">
            {erros.map((e) => <li key={e.numero}>Linha {e.numero}: {e.mensagem} <span className="tabular text-tinta-500">({e.texto})</span></li>)}
          </ul>
        </div>
      )}
      <div className="mt-3"><ErrorNote error={problema} /></div>
    </section>
  );
}
