import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, ErrorNote, Field, Spinner, inputClass } from './ui';
import { dataBR } from './Situacao';
import { hojeISO } from '../lib/empresas';

/** Dados da empresa que a comunicação usa: o número de cadastro e o identificador. */
type EmpresaComunicacao = { id: string; codigo_cadex: string };
import {
  criarComunicacao, listarComunicacoes, normalizarPlacas, validarComunicacao, type ComunicacaoServico as Comunicacao,
} from '../lib/comunicacoes';

/**
 * Comunicação prévia de serviço programado ao CISP. O aviso fica em destaque: é a regra que a
 * empresa precisa cumprir antes de começar, e só vale para quem está cadastrado no CADEX.
 */
export default function ComunicacaoServico({ empresa, podeEditar }: { empresa: EmpresaComunicacao; podeEditar: boolean }) {
  const [lista, setLista] = useState<Comunicacao[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [responsavel, setResponsavel] = useState('');
  const [placasTexto, setPlacasTexto] = useState('');
  const [local, setLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [problema, setProblema] = useState<string | null>(null);

  const carregar = useCallback(() => listarComunicacoes(empresa.id).then(setLista).catch(setErro), [empresa.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  const enviar = async () => {
    const placas = normalizarPlacas(placasTexto);
    const dados = { empresa_id: empresa.id, responsavel, placas, local_servico: local, descricao, inicio_previsto: inicio, fim_previsto: fim };
    const msg = validarComunicacao(dados);
    setProblema(msg);
    if (msg) return;
    setBusy(true);
    try {
      await criarComunicacao(dados);
      setAviso(`Comunicação registrada para ${responsavel.trim()}. Lembre a empresa de ligar para o 153 antes do início.`);
      setResponsavel(''); setPlacasTexto(''); setLocal(''); setDescricao(''); setInicio(''); setFim('');
      setAberto(false);
      await carregar();
    } catch (e) {
      setProblema(e instanceof Error ? e.message : 'Não foi possível registrar a comunicação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Comunicação de serviços programados" className="cartao p-5">
      <div role="note" className="mb-5 border-l-4 border-baixa bg-baixa/5 px-4 py-3">
        <p className="font-display text-base font-bold text-tinta-900">Serviço programado: comunicar ao CISP antes do início</p>
        <p className="mt-1 text-sm text-tinta-800">
          Ligue para o <strong className="text-tinta-900">153</strong> (CISP, Centro Integrado de Segurança Pública) antes de começar.
          <strong className="text-tinta-900"> Só empresas cadastradas no CADEX podem fazer essa comunicação.</strong>
        </p>
        <p className="mt-1 text-sm text-tinta-800">
          Obrigatório informar o <strong>número de cadastro</strong>, o <strong>responsável</strong> e as <strong>placas dos veículos</strong> usados.
        </p>
        <p className="mt-2 text-sm text-tinta-700">Número de cadastro: <span className="tabular font-semibold text-tinta-900">{empresa.codigo_cadex}</span></p>
      </div>

      {aviso && <p role="status" className="mb-4 rounded-sm border-l-4 border-alta bg-alta/10 px-3 py-2 text-sm text-tinta-800">{aviso}</p>}

      <h3 className="mb-2 font-display text-lg font-bold text-tinta-900">Comunicações registradas</h3>
      {erro ? <ErrorNote error={erro} /> : null}
      {!lista && !erro ? <Spinner /> : lista && lista.length === 0 ? <Empty>Nenhuma comunicação de serviço programado.</Empty> : (
        <ul className="divide-y divide-tinta-100 text-sm">
          {lista?.map((c) => (
            <li key={c.id} className="py-2">
              <div className="font-medium text-tinta-900">{c.local_servico}</div>
              <div className="text-tinta-700">{c.descricao}</div>
              <div className="text-xs text-tinta-500">
                {dataBR(c.inicio_previsto)} a {dataBR(c.fim_previsto)} · responsável {c.responsavel} · placas {c.placas.join(', ')}
              </div>
            </li>
          ))}
        </ul>
      )}

      {podeEditar && !aberto && (
        <div className="mt-4">
          <Button onClick={() => { setAberto(true); setProblema(null); setAviso(null); }}>Nova comunicação</Button>
        </div>
      )}

      {podeEditar && aberto && (
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          <Field label="Responsável" required>
            <input className={inputClass} required value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          </Field>
          <Field label="Placas dos veículos" required hint="Separe por vírgula. Ex.: ABC1234, ABC1D23.">
            <input className={`${inputClass} tabular`} required value={placasTexto} onChange={(e) => setPlacasTexto(e.target.value)} />
          </Field>
          <Field label="Local do serviço" required>
            <input className={inputClass} required value={local} onChange={(e) => setLocal(e.target.value)} />
          </Field>
          <Field label="Descrição do serviço" required>
            <input className={inputClass} required value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Field>
          <Field label="Início previsto" required>
            <input type="date" className={inputClass} required min={hojeISO()} value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Field>
          <Field label="Fim previsto" required>
            <input type="date" className={inputClass} required min={inicio || hojeISO()} value={fim} onChange={(e) => setFim(e.target.value)} />
          </Field>
          {problema && <p role="alert" className="md:col-span-2 text-sm text-baixa">{problema}</p>}
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar comunicação'}</Button>
            <Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
          </div>
        </form>
      )}
    </section>
  );
}
