import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Button, Empty, ErrorNote, Field, Spinner, inputClass } from './ui';
import ComunicacaoLote from './ComunicacaoLote';
import { dataBR } from './Situacao';
import { hojeISO } from '../lib/empresas';
import { coordenadaTexto, lerCoordenada } from '../lib/licencas';
import {
  PRAZO_EMERGENCIA_HORAS, TIPO_COMUNICACAO_LABEL, criarComunicacao, listarComunicacoes, normalizarPlacas,
  validarComunicacao, type ComunicacaoServico as Comunicacao, type NovaComunicacao, type TipoComunicacao,
} from '../lib/comunicacoes';

const DesenhoArea = lazy(() => import('./DesenhoArea'));

/** Dados da empresa que a comunicação usa: o número de cadastro e o identificador. */
type EmpresaComunicacao = { id: string; codigo_cadex: string };

type Ponto = [number, number]; // [lng, lat], como o mapa

const lerPonto = (texto: string): Ponto | null => {
  const c = lerCoordenada(texto);
  return c ? [c.lng, c.lat] : null;
};

/** Converte a data e hora do campo (hora local do navegador) para ISO. */
const isoDoCampo = (valor: string): string | null => (valor ? new Date(valor).toISOString() : null);



/**
 * Comunicação ao CISP pela empresa: serviço programado (registro prévio) ou emergência (ligação
 * prévia ao 153 e registro posterior ao fato). Os dois exigem o local marcado no mapa e são públicos.
 */
export default function ComunicacaoServico({ empresa, podeEditar }: { empresa: EmpresaComunicacao; podeEditar: boolean }) {
  const [lista, setLista] = useState<Comunicacao[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoComunicacao>('programado');
  const [tipoServico, setTipoServico] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [placasTexto, setPlacasTexto] = useState('');
  const [local, setLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [ocorrido, setOcorrido] = useState('');
  const [protocolo, setProtocolo] = useState('');
  const [ponto, setPonto] = useState('');
  const [trecho, setTrecho] = useState('');
  const [usaTrecho, setUsaTrecho] = useState(false);
  const [mapaAberto, setMapaAberto] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  const carregar = useCallback(() => listarComunicacoes(empresa.id).then(setLista).catch(setErro), [empresa.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  const limpar = () => {
    setTipoServico(''); setResponsavel(''); setPlacasTexto(''); setLocal(''); setDescricao('');
    setInicio(''); setFim(''); setOcorrido(''); setProtocolo(''); setPonto(''); setTrecho(''); setUsaTrecho(false);
  };

  const enviar = async () => {
    const inicioPonto = lerCoordenada(ponto);
    const fimPonto = usaTrecho ? lerCoordenada(trecho) : null;
    const dados: NovaComunicacao = {
      empresa_id: empresa.id,
      tipo,
      tipo_servico: tipoServico,
      responsavel,
      placas: normalizarPlacas(placasTexto),
      local_servico: local,
      descricao,
      inicio_previsto: tipo === 'programado' ? inicio : '',
      fim_previsto: tipo === 'programado' ? fim : (fim || ''),
      ocorrido_em: tipo === 'emergencia' ? isoDoCampo(ocorrido) : null,
      protocolo_cisp: tipo === 'emergencia' ? protocolo : null,
      inicio_lat: inicioPonto?.lat ?? null,
      inicio_lng: inicioPonto?.lng ?? null,
      fim_lat: usaTrecho ? (fimPonto?.lat ?? null) : null,
      fim_lng: usaTrecho ? (fimPonto?.lng ?? null) : null,
    };
    const msg = validarComunicacao(dados, hojeISO(), new Date());
    setProblema(msg);
    if (msg) return;
    setBusy(true);
    try {
      await criarComunicacao(dados);
      setAviso(tipo === 'emergencia'
        ? `Emergência registrada para ${responsavel.trim()}.`
        : `Comunicação registrada para ${responsavel.trim()}. Serviço programado: registre antes do início.`);
      limpar();
      setAberto(false);
      setMapaAberto(false);
      await carregar();
    } catch (e) {
      setProblema(e instanceof Error ? e.message : 'Não foi possível registrar a comunicação.');
    } finally {
      setBusy(false);
    }
  };

  const emergencia = tipo === 'emergencia';

  return (
    <section aria-label="Comunicação de serviços ao CISP" className="cartao p-5">
      <div role="note" className="mb-5 space-y-3">
        <div className="border-l-4 border-baixa bg-baixa/5 px-4 py-3">
          <p className="font-display text-base font-bold text-tinta-900">Emergência: ligar para o 153 (CISP) antes de agir</p>
          <p className="mt-1 text-sm text-tinta-800">
            Ligar para o <strong className="text-tinta-900">153</strong> (Centro Integrado de Segurança Pública) é <strong className="text-tinta-900">obrigatório</strong>, antes de começar o atendimento.
            Informe o número de cadastro, o responsável, o serviço e o local.
          </p>
          <p className="mt-1 text-sm text-tinta-800">
            O registro no CADEX também é obrigatório e vem <strong className="text-tinta-900">depois</strong> do fato, em até {PRAZO_EMERGENCIA_HORAS} horas.
          </p>
        </div>
        <div className="border-l-4 border-atencao bg-atencao/5 px-4 py-3">
          <p className="font-display text-base font-bold text-tinta-900">Serviço programado: registrar no CADEX antes do início</p>
          <p className="mt-1 text-sm text-tinta-800">
            O registro no CADEX é obrigatório e precisa ser feito <strong className="text-tinta-900">antes</strong> da data de início. Não é preciso informar o CISP.
          </p>
        </div>
        <p className="text-sm text-tinta-800">
          <strong className="text-tinta-900">Só empresas cadastradas no CADEX podem fazer essas comunicações.</strong>{' '}
          Informe o número de cadastro, o responsável, as placas dos veículos e o local no mapa.
          Número de cadastro: <span className="tabular font-semibold text-tinta-900">{empresa.codigo_cadex}</span>
        </p>
      </div>

      {aviso && <p role="status" className="mb-4 rounded-sm border-l-4 border-alta bg-alta/10 px-3 py-2 text-sm text-tinta-800">{aviso}</p>}

      <h3 className="mb-2 font-display text-lg font-bold text-tinta-900">Comunicações registradas</h3>
      {erro ? <ErrorNote error={erro} /> : null}
      {!lista && !erro ? <Spinner /> : lista && lista.length === 0 ? <Empty>Nenhuma comunicação registrada.</Empty> : (
        <ul className="divide-y divide-tinta-100 text-sm">
          {lista?.map((c) => (
            <li key={c.id} className="py-2">
              <div className="font-medium text-tinta-900">
                <span className={c.tipo === 'emergencia' ? 'text-baixa' : 'text-atencao'}>{TIPO_COMUNICACAO_LABEL[c.tipo]}</span>
                {c.tipo_servico ? ` · ${c.tipo_servico}` : ''}
              </div>
              <div className="text-tinta-700">{c.local_servico} — {c.descricao}</div>
              <div className="text-xs text-tinta-500">
                {c.tipo === 'emergencia' && c.ocorrido_em
                  ? `Fato em ${new Date(c.ocorrido_em).toLocaleString('pt-BR')}`
                  : `${dataBR(c.inicio_previsto)} a ${dataBR(c.fim_previsto)}`}
                {' · '}responsável {c.responsavel} · placas {c.placas.join(', ')}
                {c.protocolo_cisp ? ` · protocolo 153 ${c.protocolo_cisp}` : ''}
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

      {podeEditar && <ComunicacaoLote empresaId={empresa.id} onRegistrado={carregar} />}

      {podeEditar && aberto && (
        <form aria-label="Nova comunicação ao CISP" className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-2">
            <legend className="mb-1 text-sm font-medium text-tinta-800">Tipo de comunicação</legend>
            {(['programado', 'emergencia'] as const).map((t) => (
              <label key={t} className="inline-flex items-center gap-2 text-sm text-tinta-800">
                <input type="radio" name="tipo-comunicacao" value={t} checked={tipo === t}
                       onChange={() => { setTipo(t); setProblema(null); }} className="accent-marca-600" />
                {TIPO_COMUNICACAO_LABEL[t]}
              </label>
            ))}
          </fieldset>
          <Field label="Tipo de serviço" required>
            <input className={inputClass} required value={tipoServico} onChange={(e) => setTipoServico(e.target.value)} />
          </Field>
          <Field label="Responsável" required>
            <input className={inputClass} required value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          </Field>
          <Field label="Placas dos veículos" required hint="Separe por vírgula. Ex.: ABC1234, ABC1D23.">
            <input className={`${inputClass} tabular`} required value={placasTexto} onChange={(e) => setPlacasTexto(e.target.value)} />
          </Field>
          <Field label="Local do serviço" required hint="Rua, bairro ou número. O local exato é marcado no mapa.">
            <input className={inputClass} required value={local} onChange={(e) => setLocal(e.target.value)} />
          </Field>
          <Field label="Descrição do serviço" required>
            <input className={inputClass} required value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Field>

          <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-2">
            <legend className="mb-1 text-sm font-medium text-tinta-800">Local</legend>
            <label className="inline-flex items-center gap-2 text-sm text-tinta-800">
              <input type="radio" name="forma-local" checked={!usaTrecho} onChange={() => setUsaTrecho(false)} className="accent-marca-600" />
              Ponto
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-tinta-800">
              <input type="radio" name="forma-local" checked={usaTrecho} onChange={() => setUsaTrecho(true)} className="accent-marca-600" />
              Trecho em linha reta
            </label>
          </fieldset>
          <Field label={usaTrecho ? 'Início do trecho (coordenadas)' : 'Ponto (coordenadas)'} required
                 hint="Cole do Google Maps: lat, lng. Deve estar em Niterói.">
            <input className={`${inputClass} tabular`} required placeholder="-22.895000, -43.123000" value={ponto} onChange={(e) => setPonto(e.target.value)} />
          </Field>
          {usaTrecho && (
            <Field label="Fim do trecho (coordenadas)" required>
              <input className={`${inputClass} tabular`} required placeholder="-22.895000, -43.123000" value={trecho} onChange={(e) => setTrecho(e.target.value)} />
            </Field>
          )}
          <div className="md:col-span-2">
            <Button variant="secondary" className="px-3! py-1.5!" onClick={() => setMapaAberto((v) => !v)}>
              {mapaAberto ? 'Ocultar o mapa' : 'Marcar no mapa'}
            </Button>
            {mapaAberto && (
              <div className="mt-3">
                <Suspense fallback={<div className="h-[360px] rounded-sm border border-tinta-200 bg-tinta-50" />}>
                  <DesenhoArea tipo={usaTrecho ? 'segmento' : 'ponto'} inicio={lerPonto(ponto)} fim={lerPonto(trecho)} area={null} ro={false}
                               onChange={(p) => {
                                 if (p.inicio !== undefined) setPonto(p.inicio ? coordenadaTexto(p.inicio[1], p.inicio[0]) : '');
                                 if (p.fim !== undefined) setTrecho(p.fim ? coordenadaTexto(p.fim[1], p.fim[0]) : '');
                               }} />
                </Suspense>
              </div>
            )}
          </div>

          {emergencia ? (
            <>
              <Field label="Data e hora do fato" required hint={`Registre em até ${PRAZO_EMERGENCIA_HORAS} horas do fato.`}>
                <input type="datetime-local" className={inputClass} required value={ocorrido} onChange={(e) => setOcorrido(e.target.value)} />
              </Field>
              <Field label="Protocolo do 153" hint="Opcional, se a ligação gerou um protocolo.">
                <input className={`${inputClass} tabular`} value={protocolo} onChange={(e) => setProtocolo(e.target.value)} />
              </Field>
              <Field label="Previsão de término" required>
                <input type="date" className={inputClass} required min={ocorrido ? ocorrido.slice(0, 10) : undefined} value={fim} onChange={(e) => setFim(e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Início previsto" required>
                <input type="date" className={inputClass} required min={hojeISO()} value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </Field>
              <Field label="Fim previsto" required>
                <input type="date" className={inputClass} required min={inicio || hojeISO()} value={fim} onChange={(e) => setFim(e.target.value)} />
              </Field>
            </>
          )}

          {problema && <p role="alert" className="md:col-span-2 text-sm text-baixa">{problema}</p>}
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar comunicação'}</Button>
            <Button variant="secondary" onClick={() => { setAberto(false); setMapaAberto(false); }}>Cancelar</Button>
          </div>
        </form>
      )}
    </section>
  );
}
