import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button, Card, ErrorNote, Empty, Field, inputClass, Spinner, StatusBadge } from '../../components/ui';
import { documentHealth, formatCnpj, daysUntil } from '../../lib/rules';
import { useAuth } from '../../lib/auth';

/**
 * §8 — Workflow administrativo do CADEX. As transições chamam funções do
 * banco (`cadex.approve_company`), que reaplicam as regras e checam o
 * papel do usuário. A tela não decide nada sozinha.
 */
export default function CompanyDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { has } = useAuth();
  const [note, setNote] = useState('');

  const company = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const docs = useQuery({
    queryKey: ['company-docs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*, document_types(name, category, required)')
        .eq('company_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const events = useQuery({
    queryKey: ['company-events', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('administrative_events')
        .select('*')
        .eq('company_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['company', id] });
    void qc.invalidateQueries({ queryKey: ['company-events', id] });
  };

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from('companies').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('approve_company_rpc', { p_company_id: id, p_note: note });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!note.trim()) throw new Error('Informe a motivação do indeferimento.');
      const { error } = await supabase
        .from('companies')
        .update({ status: 'indeferido', rejection_reason: note })
        .eq('id', id);
      if (error) throw error;
      await supabase.from('administrative_events').insert({
        company_id: id, kind: 'indeferimento', note,
      });
    },
    onSuccess: invalidate,
  });

  const diligence = useMutation({
    mutationFn: async () => {
      if (!note.trim()) throw new Error('Descreva a diligência.');
      const { error } = await supabase.from('companies').update({ status: 'pendente' }).eq('id', id);
      if (error) throw error;
      await supabase.from('administrative_events').insert({
        company_id: id, kind: 'diligencia', note,
      });
    },
    onSuccess: invalidate,
  });

  if (company.isLoading) return <Spinner />;
  if (company.error) return <ErrorNote error={company.error} />;
  const c = company.data;
  const canDecide = has('admin', 'gestor_seconser');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{c.legal_name}</h1>
          <p className="text-sm text-slate-600">
            {formatCnpj(c.cnpj)} · CADEX {c.cadex_number ?? '—'}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Situação cadastral" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <Row k="Inscrição" v={c.valid_from ? fmt(c.valid_from) : '—'} />
            <Row
              k="Validade"
              v={c.valid_until ? `${fmt(c.valid_until)} (${daysUntil(c.valid_until)}d)` : '—'}
            />
            <Row k="Protocolo" v={c.protocol_number ?? '—'} />
            <Row k="Análise até" v={c.analysis_due_date ? fmt(c.analysis_due_date) : '—'} />
            <Row k="Saneamento até" v={c.remediation_due_date ? fmt(c.remediation_due_date) : '—'} />
            <Row k="E-mail" v={c.email} />
          </dl>
        </Card>

        <Card title="Documentação" className="lg:col-span-2">
          {docs.isLoading && <Spinner />}
          <ErrorNote error={docs.error} />
          {docs.data?.length === 0 && <Empty>Nenhum documento enviado.</Empty>}
          <ul className="divide-y divide-slate-100 text-sm">
            {(docs.data ?? []).map((d: any) => {
              const health = documentHealth(d.valid_until);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-medium text-slate-800">{d.document_types?.name}</span>
                  <StatusBadge status={d.status} />
                  {d.valid_until && (
                    <span
                      className={`text-xs ${
                        health === 'vencido' ? 'text-red-700'
                        : health === 'vencendo' ? 'text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      válido até {fmt(d.valid_until)}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">v{d.version}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {canDecide && (
        <Card title="Decisão administrativa">
          <div className="space-y-3">
            <Field label="Motivação / despacho" hint="Registrado na trilha do processo e na auditoria.">
              <textarea
                className={inputClass}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            <ErrorNote error={approve.error ?? reject.error ?? diligence.error ?? setStatus.error} />

            <div className="flex flex-wrap gap-2">
              {c.status === 'rascunho' && (
                <Button variant="secondary" onClick={() => setStatus.mutate('protocolado')}>
                  Protocolar
                </Button>
              )}
              {['protocolado', 'pendente'].includes(c.status) && (
                <Button variant="secondary" onClick={() => setStatus.mutate('em_analise')}>
                  Iniciar análise
                </Button>
              )}
              <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
                Deferir inscrição
              </Button>
              <Button variant="secondary" onClick={() => diligence.mutate()}>
                Abrir diligência
              </Button>
              <Button variant="danger" onClick={() => reject.mutate()}>
                Indeferir
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Trilha do processo">
        {events.data?.length === 0 && <Empty>Sem movimentações registradas.</Empty>}
        <ol className="space-y-2 text-sm">
          {(events.data ?? []).map((e: any) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-36 shrink-0 tabular-nums text-xs text-slate-500">
                {new Date(e.created_at).toLocaleString('pt-BR')}
              </span>
              <span className="font-medium text-slate-800">{e.kind}</span>
              <span className="text-slate-600">{e.note}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right text-slate-900">{v}</dd>
    </div>
  );
}

const fmt = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR');
