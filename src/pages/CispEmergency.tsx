import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorNote, Empty, Field, inputClass, StatusBadge, Spinner } from '../components/ui';

/**
 * §5.7, §18, §19 — Interface do CISP/SEOP. Registra o acionamento pelo
 * 153, gera o protocolo e abre a emergência. Emergência NÃO passa por
 * licença nem por autodeclaração: é um workflow próprio.
 */
export default function CispEmergency() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    protocol_number: '',
    called_at: new Date().toISOString().slice(0, 16),
    caller_name: '',
    executor_id: '',
    concessionaire_id: '',
    risk_nature: '',
    description: '',
    address: '',
    lng: '',
    lat: '',
  });

  const companies = useQuery({
    queryKey: ['active-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, legal_name, cadex_number, is_concessionaire, status')
        .in('status', ['ativo', 'proximo_vencimento'])
        .order('legal_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const open = useQuery({
    queryKey: ['open-emergencies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emergencies')
        .select('id, status, risk_nature, regularization_due_at, regularized_at, cisp_protocols(protocol_number, called_at), interventions(address, companies:executor_id(legal_name))')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.protocol_number.trim()) throw new Error('Informe o protocolo CISP.');
      if (!form.executor_id) throw new Error('Selecione a empresa executora.');
      if (!form.lng || !form.lat) throw new Error('Informe a localização da ocorrência.');

      const { data: proto, error: pe } = await supabase
        .from('cisp_protocols')
        .insert({
          protocol_number: form.protocol_number.trim(),
          called_at: new Date(form.called_at).toISOString(),
          caller_name: form.caller_name || null,
        })
        .select('id')
        .single();
      if (pe) throw pe;

      const { data: type } = await supabase
        .from('intervention_types')
        .select('id')
        .eq('code', 'EMERGENCIA')
        .single();

      const { data: interv, error: ie } = await supabase
        .from('interventions')
        .insert({
          kind: 'emergencia',
          type_id: type?.id ?? null,
          executor_id: form.executor_id,
          concessionaire_id: form.concessionaire_id || null,
          geom: `SRID=4326;POINT(${Number(form.lng)} ${Number(form.lat)})`,
          address: form.address || null,
          description: form.description || form.risk_nature,
        })
        .select('id')
        .single();
      if (ie) throw ie;

      const { error: ee } = await supabase.from('emergencies').insert({
        intervention_id: interv.id,
        cisp_protocol_id: proto.id,
        risk_nature: form.risk_nature,
        status: 'acionada',
      });
      if (ee) throw ee;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['open-emergencies'] });
      setForm((f) => ({ ...f, protocol_number: '', risk_nature: '', description: '', address: '' }));
    },
  });

  const executors = (companies.data ?? []).filter((c: any) => !c.is_concessionaire);
  const concessionaires = (companies.data ?? []).filter((c: any) => c.is_concessionaire);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">CISP — atendimento emergencial</h1>

      <Card title="Registrar acionamento (153)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Protocolo CISP" required>
            <input className={inputClass} value={form.protocol_number}
              onChange={(e) => setForm({ ...form, protocol_number: e.target.value })} />
          </Field>
          <Field label="Horário do acionamento" required>
            <input type="datetime-local" className={inputClass} value={form.called_at}
              onChange={(e) => setForm({ ...form, called_at: e.target.value })} />
          </Field>
          <Field label="Solicitante">
            <input className={inputClass} value={form.caller_name}
              onChange={(e) => setForm({ ...form, caller_name: e.target.value })} />
          </Field>
          <Field label="Natureza do risco" required>
            <input className={inputClass} value={form.risk_nature}
              onChange={(e) => setForm({ ...form, risk_nature: e.target.value })} />
          </Field>
          <Field
            label="Empresa executora"
            required
            hint="Apenas empresas com CADEX ativo (§43 Regra 1)."
          >
            <select className={inputClass} value={form.executor_id}
              onChange={(e) => setForm({ ...form, executor_id: e.target.value })}>
              <option value="">Selecione…</option>
              {executors.map((c: any) => (
                <option key={c.id} value={c.id}>{c.legal_name} — {c.cadex_number}</option>
              ))}
            </select>
          </Field>
          <Field label="Concessionária contratante">
            <select className={inputClass} value={form.concessionaire_id}
              onChange={(e) => setForm({ ...form, concessionaire_id: e.target.value })}>
              <option value="">Não se aplica</option>
              {concessionaires.map((c: any) => (
                <option key={c.id} value={c.id}>{c.legal_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Endereço">
            <input className={inputClass} value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Longitude" required>
              <input className={inputClass} inputMode="decimal" value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })} />
            </Field>
            <Field label="Latitude" required>
              <input className={inputClass} inputMode="decimal" value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Descrição da ocorrência">
              <textarea className={inputClass} rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? 'Registrando…' : 'Registrar emergência'}
          </Button>
          <span className="text-xs text-slate-500">
            O prazo de regularização é contado automaticamente a partir do acionamento.
          </span>
        </div>
        <div className="mt-3"><ErrorNote error={create.error} /></div>
      </Card>

      <Card title="Emergências registradas">
        {open.isLoading && <Spinner />}
        <ErrorNote error={open.error} />
        {open.data?.length === 0 && <Empty>Nenhuma emergência registrada.</Empty>}
        <ul className="divide-y divide-slate-100 text-sm">
          {(open.data ?? []).map((e: any) => {
            const late = !e.regularized_at && e.regularization_due_at &&
              new Date(e.regularization_due_at) < new Date();
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-mono text-xs">{e.cisp_protocols?.protocol_number}</span>
                <span className="font-medium text-slate-800">
                  {e.interventions?.companies?.legal_name}
                </span>
                <span className="text-slate-600">{e.risk_nature}</span>
                <StatusBadge status={e.status} />
                {late && (
                  <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-200">
                    prazo vencido
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
