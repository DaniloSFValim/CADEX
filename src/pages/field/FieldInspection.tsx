import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, BUCKETS, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Button, Card, ErrorNote, Field, inputClass, StatusBadge, Spinner } from '../../components/ui';
import type { PublicIntervention } from '../../lib/map';

type Result = 'conforme' | 'nao_conforme' | 'nao_aplicavel';

/**
 * §25, §42 — Checklist de fiscalização com foto e GPS. A fiscalização é
 * gravada de verdade (tabelas inspections / inspection_items /
 * inspection_photos), não é um formulário de fachada.
 */
export default function FieldInspection() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [answers, setAnswers] = useState<Record<string, Result>>({});
  const [findings, setFindings] = useState('');
  const [pos, setPos] = useState<GeolocationCoordinates | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const target = useQuery({
    queryKey: ['inspection-target', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('verify_public_token', { p_token: token });
      if (error) throw error;
      return data as PublicIntervention & { found?: boolean };
    },
  });

  const checklist = useQuery({
    queryKey: ['checklist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspection_checklist_items')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos(p.coords),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  const kind = target.data?.kind;
  const items = (checklist.data ?? []).filter(
    (i: any) => !i.applies_to || !kind || i.applies_to === kind,
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Sessão expirada.');
      const answered = items.filter((i: any) => answers[i.id]);
      if (answered.length === 0) throw new Error('Responda ao menos um item do checklist.');

      // 1) Localiza a intervenção pelo token público, se houver.
      let interventionId: string | null = null;
      let companyId: string | null = null;
      if (token) {
        const { data } = await supabase
          .from('interventions')
          .select('id, executor_id')
          .eq('public_token', token)
          .maybeSingle();
        interventionId = data?.id ?? null;
        companyId = data?.executor_id ?? null;
      }

      // 2) Cria a fiscalização.
      const { data: insp, error } = await supabase
        .from('inspections')
        .insert({
          intervention_id: interventionId,
          company_id: companyId,
          inspector_id: profile.id,
          address: target.data?.street ?? null,
          findings: findings || null,
          location: pos
            ? `SRID=4326;POINT(${pos.longitude} ${pos.latitude})`
            : null,
          location_accuracy_m: pos?.accuracy ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;

      // 3) Itens do checklist (o resultado global é derivado por trigger).
      const { error: itemsError } = await supabase.from('inspection_items').insert(
        answered.map((i: any) => ({
          inspection_id: insp.id,
          item_id: i.id,
          result: answers[i.id],
        })),
      );
      if (itemsError) throw itemsError;

      // 4) Fotografias, em bucket privado.
      for (const file of photos) {
        const path = `${insp.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKETS.inspectionPhotos)
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        await supabase.from('inspection_photos').insert({
          inspection_id: insp.id,
          storage_path: path,
          taken_at: new Date().toISOString(),
          location: pos ? `SRID=4326;POINT(${pos.longitude} ${pos.latitude})` : null,
        });
      }

      return insp.id as string;
    },
    onSuccess: () => navigate('/campo'),
  });

  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-xl font-bold text-slate-900">Registro de fiscalização</h1>

      {token && target.isLoading && <Spinner label="Identificando intervenção…" />}
      {token && target.data && (target.data as { found?: boolean }).found !== false && (
        <Card title="Intervenção identificada" action={<StatusBadge status={target.data.status} />}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Info k="Empresa executora" v={target.data.executor_name} />
            <Info k="CADEX" v={target.data.executor_cadex} />
            <Info k="Concessionária" v={target.data.concessionaire_name} />
            <Info k="Licença / autodeclaração" v={target.data.license_number ?? target.data.declaration_number} />
            <Info k="Escopo" v={target.data.scope ?? target.data.description} />
            <Info k="Trecho" v={[target.data.street, target.data.district].filter(Boolean).join(' — ')} />
          </dl>
        </Card>
      )}

      <Card title="Checklist">
        {checklist.isLoading && <Spinner />}
        <ul className="divide-y divide-slate-100">
          {items.map((i: any) => (
            <li key={i.id} className="py-3">
              <p className="text-sm font-medium text-slate-800">{i.label}</p>
              <div className="mt-2 flex gap-2">
                {(['conforme', 'nao_conforme', 'nao_aplicavel'] as Result[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={answers[i.id] === r}
                    onClick={() => setAnswers((a) => ({ ...a, [i.id]: r }))}
                    className={`flex-1 rounded-md px-2 py-2 text-xs font-medium ring-1 ring-inset ${
                      answers[i.id] === r
                        ? r === 'conforme'
                          ? 'bg-emerald-600 text-white ring-emerald-600'
                          : r === 'nao_conforme'
                            ? 'bg-red-700 text-white ring-red-700'
                            : 'bg-slate-600 text-white ring-slate-600'
                        : 'bg-white text-slate-700 ring-slate-300'
                    }`}
                  >
                    {r === 'conforme' ? 'Conforme' : r === 'nao_conforme' ? 'Não conforme' : 'N/A'}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Evidências">
        <div className="space-y-4">
          <Field label="Observações">
            <textarea
              className={inputClass}
              rows={3}
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
            />
          </Field>

          <Field label="Fotografias" hint={`Até ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB por arquivo.`}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="block w-full text-sm"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                const bad = files.find(
                  (f) => f.size > MAX_UPLOAD_BYTES || !ALLOWED_UPLOAD_TYPES.includes(f.type),
                );
                setPhotoError(bad ? `Arquivo rejeitado: ${bad.name}` : null);
                setPhotos(files.filter((f) => f !== bad));
              }}
            />
          </Field>
          {photoError && <ErrorNote error={new Error(photoError)} />}

          <p className="text-xs text-slate-500">
            {pos
              ? `Localização capturada: ${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)} (±${Math.round(pos.accuracy)} m)`
              : 'Localização não disponível — o registro será gravado sem coordenada.'}
          </p>
        </div>
      </Card>

      <ErrorNote error={submit.error} />

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto flex max-w-7xl gap-3">
          <Button variant="secondary" onClick={() => navigate('/campo')} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="flex-[2]">
            {submit.isPending ? 'Gravando…' : 'Concluir fiscalização'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className="text-slate-900">{v}</dd>
    </div>
  );
}
