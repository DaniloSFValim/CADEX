import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorNote, Empty, Field, inputClass, StatusBadge, Spinner } from '../components/ui';

/**
 * Interface do CISP/SEOP (art. 2º, VI).
 *
 * Art. 19: o atendimento de emergência independe de licença prévia e de
 * autodeclaração, "sendo obrigatório o acionamento telefônico do número
 * 153 (CISP) no momento do deslocamento da equipe".
 *
 * Art. 19, § 1º: a comunicação deve informar o número do CADEX da
 * empresa, o endereço da ocorrência, a natureza do risco, o tipo e a
 * placa do veículo utilizado, e o nome, a identidade e o telefone de
 * contato do responsável presente no local. Todos esses campos são
 * exigidos aqui e revalidados pelo banco.
 */
export default function CispEmergency() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    protocol_number: '',
    called_at: new Date().toISOString().slice(0, 16),
    caller_name: '',
    executor_id: '',
    concessionaire_id: '',
    risk_category: 'risco_iminente',
    risk_nature: '',
    vehicle_kind: '',
    vehicle_plate: '',
    responsible_name: '',
    responsible_doc: '',
    responsible_phone: '',
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
      // Art. 19, § 1º — conteúdo mínimo da comunicação ao 153.
      if (!form.protocol_number.trim()) throw new Error('Informe o protocolo do CISP.');
      if (!form.executor_id) throw new Error('Selecione a empresa executora (art. 19, § 1º).');
      if (!form.address.trim()) throw new Error('Informe o endereço da ocorrência (art. 19, § 1º).');
      if (!form.risk_nature.trim()) throw new Error('Informe a natureza do risco (art. 19, § 1º).');
      if (!form.vehicle_kind.trim() || !form.vehicle_plate.trim())
        throw new Error('Informe o tipo e a placa do veículo utilizado (art. 19, § 1º).');
      if (!form.responsible_name.trim() || !form.responsible_doc.trim() || !form.responsible_phone.trim())
        throw new Error('Informe nome, identidade e telefone do responsável presente no local (art. 19, § 1º).');
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
        risk_category: form.risk_category,
        vehicle_kind: form.vehicle_kind,
        vehicle_plate: form.vehicle_plate,
        on_site_responsible_name: form.responsible_name,
        on_site_responsible_doc: form.responsible_doc,
        on_site_responsible_phone: form.responsible_phone,
        status: 'acionada',
        // Art. 19: o acionamento ocorre no momento do deslocamento.
        dispatched_at: new Date(form.called_at).toISOString(),
      });
      if (ee) throw ee;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['open-emergencies'] });
      setForm((f) => ({
        ...f, protocol_number: '', risk_nature: '', description: '', address: '',
        vehicle_kind: '', vehicle_plate: '',
        responsible_name: '', responsible_doc: '', responsible_phone: '',
      }));
    },
  });

  const executors = (companies.data ?? []).filter((c: any) => !c.is_concessionaire);
  const concessionaires = (companies.data ?? []).filter((c: any) => c.is_concessionaire);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">CISP 153 — atendimento emergencial</h1>

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
          <Field label="Hipótese do art. 18" required>
            <select className={inputClass} value={form.risk_category}
              onChange={(e) => setForm({ ...form, risk_category: e.target.value })}>
              <option value="risco_iminente">
                I — risco iminente à vida, saúde, segurança ou patrimônio
              </option>
              <option value="servico_essencial">
                II — restabelecimento de serviço essencial
              </option>
            </select>
          </Field>
          <Field label="Natureza do risco" required hint="Art. 19, § 1º.">
            <input className={inputClass} value={form.risk_nature}
              onChange={(e) => setForm({ ...form, risk_nature: e.target.value })} />
          </Field>
          <Field label="Tipo do veículo" required hint="Art. 19, § 1º.">
            <input className={inputClass} value={form.vehicle_kind}
              onChange={(e) => setForm({ ...form, vehicle_kind: e.target.value })} />
          </Field>
          <Field label="Placa do veículo" required hint="Art. 19, § 1º.">
            <input className={inputClass} value={form.vehicle_plate}
              onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Responsável presente no local" required hint="Art. 19, § 1º.">
            <input className={inputClass} value={form.responsible_name}
              onChange={(e) => setForm({ ...form, responsible_name: e.target.value })} />
          </Field>
          <Field label="Identidade do responsável" required hint="Art. 19, § 1º.">
            <input className={inputClass} value={form.responsible_doc}
              onChange={(e) => setForm({ ...form, responsible_doc: e.target.value })} />
          </Field>
          <Field label="Telefone de contato do responsável" required hint="Art. 19, § 1º.">
            <input className={inputClass} value={form.responsible_phone}
              onChange={(e) => setForm({ ...form, responsible_phone: e.target.value })} />
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
          <Field label="Endereço da ocorrência" required hint="Art. 19, § 1º.">
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
            Art. 20: o prazo de 24 horas para registro do protocolo, das imagens e do
            escopo começa a correr da <strong>conclusão do atendimento</strong>, não
            do acionamento.
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
