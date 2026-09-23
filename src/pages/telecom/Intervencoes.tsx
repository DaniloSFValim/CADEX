import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, ErrorNote, Field, Spinner, inputClass } from '../../components/ui';
import { GeometryEditor } from '../../components/GeometryEditor';
import { toEwkt } from '../../lib/geo';
import {
  PHASE_LABEL, createIntervention, deleteIntervention, loadInterventions, loadTypes,
  markObra, markServico, obraPhase, servicoPhase, updateIntervention,
  type Intervention, type Phase, type loadTelecom,
} from '../../lib/telecom';

type Data = Awaited<ReturnType<typeof loadTelecom>>;
type Kind = 'obra' | 'manutencao';

const PHASE_TONE: Record<Phase, string> = {
  programada: 'bg-slate-100 text-slate-700 ring-slate-300',
  em_andamento: 'bg-amber-50 text-amber-900 ring-amber-300',
  concluida: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  cancelada: 'bg-red-50 text-red-800 ring-red-300',
};

const brDate = (iso: string | null): string =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('pt-BR') : '—';

export default function Intervencoes({ kind, data }: { kind: Kind; data: Data }) {
  const qc = useQueryClient();
  const operatorIds = data.operators.map((o) => o.id);
  const key = ['telecom-interventions', kind, operatorIds.join(',')];

  const list = useQuery({ queryKey: key, queryFn: () => loadInterventions(kind, operatorIds) });
  const types = useQuery({ queryKey: ['types', kind], queryFn: () => loadTypes(kind) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const [filter, setFilter] = useState<Phase | 'todas'>('todas');
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Intervention | null>(null);

  if (data.operators.length === 0) {
    return <Empty>Cadastre uma operadora antes de registrar {kind === 'obra' ? 'obras' : 'serviços'}.</Empty>;
  }

  const name = (id: string | null) => {
    const c = id ? data.companies.get(id) : undefined;
    return c ? c.trade_name || c.legal_name : '—';
  };
  const phaseOf = (i: Intervention): Phase =>
    kind === 'obra' ? obraPhase(i) : servicoPhase(i.declarations[0]?.status);

  const rows = (list.data ?? []).filter((i) => filter === 'todas' || phaseOf(i) === filter);

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); refresh(); } catch (e) { setError(e); }
  };

  return (
    <div className="space-y-5">
      <InterventionForm
        key={editing?.id ?? 'novo'}
        kind={kind}
        data={data}
        types={types.data ?? []}
        editing={editing}
        onDone={() => { setEditing(null); refresh(); }}
        onCancel={() => setEditing(null)}
      />

      <Card
        title={kind === 'obra' ? 'Obras programadas' : 'Serviços de rotina'}
        action={
          <select id={`filtro-${kind}`} aria-label="Filtrar por situação"
                  className="rounded-md border-0 py-1 pl-2 pr-8 text-sm ring-1 ring-inset ring-slate-300"
                  value={filter} onChange={(e) => setFilter(e.target.value as Phase | 'todas')}>
            <option value="todas">Todas</option>
            {(Object.keys(PHASE_LABEL) as Phase[])
              .filter((p) => kind === 'manutencao' || p !== 'cancelada')
              .map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
          </select>
        }
      >
        <ErrorNote error={error} />
        {list.isLoading && <Spinner />}
        <ErrorNote error={list.error} />
        {list.data && rows.length === 0 && <Empty>Nada nesta situação.</Empty>}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Descrição</th>
                  <th className="py-2 pr-4">Operadora</th>
                  <th className="py-2 pr-4">Executora</th>
                  <th className="py-2 pr-4">Local</th>
                  <th className="py-2 pr-4">Período</th>
                  <th className="py-2 pr-4">Situação</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => {
                  const phase = phaseOf(i);
                  const decl = i.declarations[0];
                  return (
                    <tr key={i.id} className="align-top">
                      <td className="py-2 pr-4">
                        <div className="font-medium text-slate-800">{i.description}</div>
                        {decl?.declaration_number && (
                          <div className="font-mono text-xs text-slate-500">{decl.declaration_number}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4">{name(i.concessionaire_id)}</td>
                      <td className="py-2 pr-4">{name(i.executor_id)}</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {i.address ?? '—'}{i.district ? <><br />{i.district}</> : null}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                        {brDate(i.starts_on)} – {brDate(i.ends_on)}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PHASE_TONE[phase]}`}>
                          {PHASE_LABEL[phase]}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          {phase === 'programada' && (
                            <Button variant="secondary" onClick={() => act(() =>
                              kind === 'obra' ? markObra(i.id, 'start') : markServico(decl!.id, 'em_execucao'))}>
                              Iniciar
                            </Button>
                          )}
                          {phase === 'em_andamento' && (
                            <Button variant="secondary" onClick={() => act(() =>
                              kind === 'obra' ? markObra(i.id, 'finish') : markServico(decl!.id, 'encerrada'))}>
                              Concluir
                            </Button>
                          )}
                          {kind === 'manutencao' && phase === 'programada' && (
                            <Button variant="secondary" onClick={() => act(() => markServico(decl!.id, 'cancelada'))}>
                              Cancelar
                            </Button>
                          )}
                          <Button variant="secondary" onClick={() => {
                            setEditing(i);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}>
                            Editar
                          </Button>
                          <Button variant="secondary" onClick={() => {
                            if (window.confirm('Excluir este registro? A exclusão fica na trilha de auditoria.')) {
                              void act(() => deleteIntervention(i.id));
                            }
                          }}>
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Cadastra ou, com `editing`, altera uma obra ou serviço. */
function InterventionForm({
  kind, data, types, editing, onDone, onCancel,
}: {
  kind: Kind;
  data: Data;
  types: { id: string; name: string }[];
  editing: Intervention | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const e0 = editing;
  const [operatorId, setOperatorId] = useState(e0?.concessionaire_id ?? data.operators[0]?.id ?? '');
  const [executorId, setExecutorId] = useState(
    e0 && e0.executor_id !== e0.concessionaire_id ? e0.executor_id : '');
  const [typeId, setTypeId] = useState(e0?.type_id ?? '');
  const [description, setDescription] = useState(e0?.description ?? '');
  const [address, setAddress] = useState(e0?.address ?? '');
  const [district, setDistrict] = useState(e0?.district ?? '');
  const [startsOn, setStartsOn] = useState(e0?.starts_on ?? '');
  const [endsOn, setEndsOn] = useState(e0?.ends_on ?? '');
  const [geometry, setGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [mapKey, setMapKey] = useState(0);

  // Executora: a própria operadora ou uma terceirizada ativa dela.
  const executors = useMemo(() => {
    const ids = [operatorId, ...data.links
      .filter((l) => l.parent_id === operatorId && l.active).map((l) => l.child_id)];
    // Na edição, a executora atual continua na lista mesmo com vínculo encerrado.
    if (e0 && !ids.includes(e0.executor_id)) ids.push(e0.executor_id);
    return ids.map((id) => data.companies.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof data.companies.get>>[];
  }, [operatorId, data]);

  const label = kind === 'obra' ? 'obra' : 'serviço';

  return (
    <Card title={editing
      ? `Editar ${kind === 'obra' ? 'obra' : 'serviço'}: ${editing.description}`
      : kind === 'obra' ? 'Nova obra programada' : 'Novo serviço de rotina'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!geometry && !editing) { setError(new Error('Marque o local no mapa.')); return; }
          if (endsOn && startsOn && endsOn < startsOn) {
            setError(new Error('A data de término não pode ser anterior à de início.'));
            return;
          }
          setBusy(true);
          try {
            if (editing) {
              await updateIntervention(editing.id, {
                type_id: typeId, executor_id: executorId || operatorId, description,
                address, district, starts_on: startsOn, ends_on: endsOn,
                geom: geometry ? toEwkt(geometry) : null,
              }, editing.declarations[0]?.id);
            } else {
              await createIntervention({
                kind, type_id: typeId, concessionaire_id: operatorId,
                executor_id: executorId || operatorId, description, address, district,
                starts_on: startsOn, ends_on: endsOn, geom: toEwkt(geometry!),
              });
              setDescription(''); setAddress(''); setDistrict('');
              setStartsOn(''); setEndsOn(''); setGeometry(null); setMapKey((k) => k + 1);
            }
            onDone();
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Operadora" required hint={editing ? 'A operadora não muda na edição.' : undefined}>
            <select id={`${kind}-op`} className={`${inputClass} disabled:bg-slate-100`} value={operatorId}
                    required disabled={Boolean(editing)}
                    onChange={(e) => { setOperatorId(e.target.value); setExecutorId(''); }}>
              {data.operators.map((o) => (
                <option key={o.id} value={o.id}>{o.trade_name || o.legal_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Executora" hint="A própria operadora ou uma terceirizada dela.">
            <select id={`${kind}-exec`} className={inputClass} value={executorId}
                    onChange={(e) => setExecutorId(e.target.value)}>
              {executors.map((c) => (
                <option key={c.id} value={c.id === operatorId ? '' : c.id}>
                  {c.trade_name || c.legal_name}{c.id === operatorId ? ' (própria operadora)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo" required>
            <select id={`${kind}-tipo`} className={inputClass} value={typeId} required
                    onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Selecione…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Descrição" required>
          <input id={`${kind}-desc`} className={inputClass} value={description} required
                 placeholder={kind === 'obra' ? 'Ex.: lançamento de fibra óptica subterrânea' : 'Ex.: emenda de cabo em rede aérea'}
                 onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Endereço">
            <input id={`${kind}-end`} className={inputClass} value={address}
                   onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Bairro">
            <input id={`${kind}-bairro`} className={inputClass} value={district}
                   onChange={(e) => setDistrict(e.target.value)} />
          </Field>
          <Field label="Início previsto" required>
            <input id={`${kind}-ini`} type="date" className={inputClass} value={startsOn} required
                   onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Término previsto">
            <input id={`${kind}-fim`} type="date" className={inputClass} value={endsOn}
                   onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Local {!editing && <span className="text-red-600">*</span>}
          </p>
          {editing && (
            <p className="mb-2 text-xs text-slate-500">
              Mantém o local já gravado. Marque um ponto no mapa só se quiser trocá-lo.
            </p>
          )}
          <GeometryEditor key={mapKey} kind="Point" geometry={geometry}
                          onGeometryChange={setGeometry} className="h-[300px]" />
        </div>

        <ErrorNote error={error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : editing ? 'Salvar alterações' : `Cadastrar ${label}`}
          </Button>
          {editing && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}
        </div>
      </form>
    </Card>
  );
}
