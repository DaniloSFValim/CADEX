import { useEffect, useState } from 'react';
import { Button, ErrorNote, Field, inputClass } from './ui';
import { dataBR } from './Situacao';
import { useAuth } from '../lib/auth';
import type { LicencaComTrechos } from '../lib/licencas';
import {
  listarPedidosCorrecao, listarSuspensoes, pedirCorrecao, resolverCorrecao, retomarLicenca, suspenderLicenca, suspensaoAtiva,
  type PedidoCorrecao, type Suspensao,
} from '../lib/suspensoes';

/**
 * Suspensão a pedido e pedidos de correção. Nenhum dos dois muda a situação da licença:
 * a suspensão é um período (os dias não contam na validade) e o pedido é uma pendência aberta.
 */
export function SuspensaoECorrecoes({ licenca, hoje, onMudou }: {
  licenca: LicencaComTrechos; hoje: string; onMudou: () => Promise<void>;
}) {
  const { podeLicenciar } = useAuth();
  const [suspensoes, setSuspensoes] = useState<Suspensao[]>([]);
  const [pedidos, setPedidos] = useState<PedidoCorrecao[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [motivo, setMotivo] = useState('');
  const [novoPedido, setNovoPedido] = useState('');
  const [resolucoes, setResolucoes] = useState<Record<string, string>>({});

  const carregar = () => Promise.all([listarSuspensoes(licenca.id), listarPedidosCorrecao(licenca.id)])
    .then(([s, p]) => { setSuspensoes(s); setPedidos(p); })
    .catch(setErro);
  useEffect(() => { void carregar(); }, [licenca.id, licenca.atualizado_em]);

  const acao = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErro(null);
    try {
      await fn();
      await carregar();
      await onMudou();
    } catch (e) {
      setErro(e);
    } finally {
      setBusy(false);
    }
  };

  const ativa = suspensaoAtiva(suspensoes);
  const historico = suspensoes.filter((s) => s.fim !== null);
  const podeSuspender = podeLicenciar && licenca.situacao === 'deferida' && !licenca.concluida_em;
  const abertos = pedidos.filter((p) => p.resolvido_em === null);
  const resolvidos = pedidos.filter((p) => p.resolvido_em !== null);

  return (
    <section className="cartao mb-10 p-5" aria-label="Suspensão e pedidos de correção">
      <h2 className="font-display text-base font-bold text-tinta-900">Suspensão a pedido</h2>
      {ativa ? (
        <>
          <p className="mt-2 text-sm text-tinta-700">
            Suspensa desde <strong>{dataBR(ativa.inicio)}</strong>: {ativa.motivo}. Os dias suspensos não contam na validade.
          </p>
          {podeLicenciar && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Field label="Retomar em">
                <input type="date" className={inputClass} value={fim} min={ativa.inicio} max={hoje}
                       onChange={(e) => setFim(e.target.value)} />
              </Field>
              <Button type="button" variant="secondary" disabled={busy || !fim}
                      onClick={() => void acao(() => retomarLicenca(licenca.id, fim))}>
                Retomar
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-tinta-700">Não está suspensa.</p>
      )}

      {podeSuspender && !ativa && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <Field label="Suspender a partir de">
            <input type="date" className={inputClass} value={inicio} min={licenca.inicio_previsto ?? undefined} max={hoje}
                   onChange={(e) => setInicio(e.target.value)} />
          </Field>
          <Field label="Motivo">
            <input type="text" className={inputClass} value={motivo} maxLength={500}
                   onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <Button type="button" variant="secondary" disabled={busy || !inicio || motivo.trim().length < 3}
                  onClick={() => void acao(async () => { await suspenderLicenca(licenca.id, inicio, motivo.trim()); setMotivo(''); })}>
            Suspender
          </Button>
        </div>
      )}

      {historico.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-tinta-800">Suspensões anteriores</h3>
          <ul className="mt-2 space-y-1 text-sm text-tinta-700">
            {historico.map((s) => (
              <li key={s.id}>{dataBR(s.inicio)} a {dataBR(s.fim!)}: {s.motivo}</li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 font-display text-base font-bold text-tinta-900">Pedidos de correção</h2>
      {abertos.length === 0 && resolvidos.length === 0 && (
        <p className="mt-2 text-sm text-tinta-700">Nenhum pedido de correção registrado.</p>
      )}
      {abertos.length > 0 && (
        <ul className="mt-2 space-y-3 text-sm text-tinta-700">
          {abertos.map((p) => (
            <li key={p.id} className="rounded-sm border border-atencao/40 bg-atencao/6 p-3">
              <p><strong>Aberto em {dataBR(p.pedido_em.slice(0, 10))}</strong>: {p.motivo}</p>
              {podeLicenciar && (
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <Field label="Resolução">
                    <input type="text" className={inputClass} value={resolucoes[p.id] ?? ''} maxLength={500}
                           onChange={(e) => setResolucoes({ ...resolucoes, [p.id]: e.target.value })} />
                  </Field>
                  <Button type="button" variant="secondary"
                          disabled={busy || (resolucoes[p.id] ?? '').trim().length < 3}
                          onClick={() => void acao(() => resolverCorrecao(p.id, resolucoes[p.id].trim()))}>
                    Registrar resolução
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {resolvidos.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-tinta-600">
          {resolvidos.map((p) => (
            <li key={p.id}>Resolvido em {dataBR(p.resolvido_em!.slice(0, 10))}: {p.resolucao}</li>
          ))}
        </ul>
      )}
      {podeLicenciar && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Novo pedido de correção">
            <input type="text" className={inputClass} value={novoPedido} maxLength={500}
                   onChange={(e) => setNovoPedido(e.target.value)} />
          </Field>
          <Button type="button" variant="secondary" disabled={busy || novoPedido.trim().length < 3}
                  onClick={() => void acao(async () => { await pedirCorrecao(licenca.id, novoPedido.trim()); setNovoPedido(''); })}>
            Pedir correção
          </Button>
        </div>
      )}
      <div className="mt-2"><ErrorNote error={erro} /></div>
    </section>
  );
}
