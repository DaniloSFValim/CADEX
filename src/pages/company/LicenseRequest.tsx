import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth';
import { supabase, BUCKETS, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } from '../../lib/supabase';
import {
  Button, Card, ErrorNote, Field, Empty, Spinner, StatusBadge, inputClass,
} from '../../components/ui';
import { GeometryEditor } from '../../components/GeometryEditor';
import {
  approximateLengthM, describeGeometry, firstAndLast, formatLatLng, importGeometryFile,
  parseLatLng, pointEwkt, toEwkt, type LngLat,
} from '../../lib/geo';
import {
  LICENSE_DOCUMENTS, STEPS, emptyDraft, hasProblems, validateAll, validateStep,
  type LicenseDocumentKind, type LicenseDraft, type Problems, type ScheduleStage,
} from '../../lib/licensing';
import { formatCnpj, isCadexActive, isValidCnpj } from '../../lib/rules';

/**
 * Pedido de licença de obra de infraestrutura em 6 etapas (arts. 10 a 14).
 *
 * O rascunho vive no banco, não na memória do navegador: a partir da
 * etapa 2 — quando já existem geometria e descrição, que são colunas
 * obrigatórias de `interventions` — cada avanço grava. Sair e voltar
 * retoma de onde parou.
 *
 * Nenhuma validação daqui é a regra: o banco recusa protocolo sem a
 * instrução do art. 12, recusa trecho sem coordenadas de início e fim e
 * recusa que o requerente escreva a decisão. A conferência no cliente
 * existe para o usuário não descobrir isso por mensagem de erro.
 */
export default function LicenseRequest() {
  const { id: licenseIdParam } = useParams<{ id?: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<LicenseDraft>(emptyDraft());
  const [problems, setProblems] = useState<Problems>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const set = <K extends keyof LicenseDraft>(k: K, v: LicenseDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // --- dados de apoio -------------------------------------------------
  const company = useQuery({
    queryKey: ['my-company', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies').select('*').eq('id', companyId!).single();
      if (error) throw error;
      return data as { status: string; valid_until: string | null; legal_name: string; cnpj: string };
    },
  });

  const types = useQuery({
    queryKey: ['intervention-types', 'obra'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intervention_types')
        .select('id, code, name, description')
        .eq('kind', 'obra').eq('active', true).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const responsibles = useQuery({
    queryKey: ['technical-responsibles', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('technical_responsibles')
        .select('id, full_name, professional_body, registration_no, registration_uf')
        .eq('company_id', companyId!).eq('active', true).order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // --- rascunho existente ---------------------------------------------
  const existing = useQuery({
    queryKey: ['license-draft', licenseIdParam],
    enabled: !!licenseIdParam,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('license_draft_rpc', { p_license_id: licenseIdParam });
      if (error) throw error;
      if (!data) throw new Error('Pedido não encontrado ou fora do seu acesso.');
      return data as LicenseDraftPayload;
    },
  });

  useEffect(() => {
    const payload = existing.data;
    if (!payload || loadedFor === licenseIdParam) return;
    setDraft(fromPayload(payload));
    setLoadedFor(licenseIdParam ?? null);
  }, [existing.data, licenseIdParam, loadedFor]);

  const documents = useQuery({
    queryKey: ['license-documents', draft.licenseId],
    enabled: !!draft.licenseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('license_documents')
        .select('id, kind, file_name, file_size, mime_type, storage_path, created_at')
        .eq('license_id', draft.licenseId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as LicenseDocumentRow[];
    },
  });

  const uploadedKinds = useMemo(
    () => new Set((documents.data ?? []).map((d) => d.kind)),
    [documents.data],
  );

  // Erro já corrigido some sozinho: quem viu a mensagem e ajustou o campo
  // não precisa clicar em "continuar" de novo só para saber que resolveu.
  useEffect(() => {
    setProblems((shown) => {
      if (Object.keys(shown).length === 0) return shown;
      const still = validateStep(step, draft, uploadedKinds);
      const next: Problems = {};
      for (const key of Object.keys(shown)) {
        if (still[key]) next[key] = still[key];
      }
      return Object.keys(next).length === Object.keys(shown).length ? shown : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, uploadedKinds, step]);


  // --- gravação do rascunho -------------------------------------------
  const save = useMutation({
    mutationFn: async (d: LicenseDraft) => {
      if (!companyId) throw new Error('Usuário sem empresa vinculada.');
      if (!d.geometry) throw new Error('A geometria da intervenção ainda não foi definida.');

      const intervention = {
        kind: 'obra' as const,
        type_id: d.typeId,
        executor_id: companyId,
        concessionaire_id: d.concessionaireId,
        subcontractor_id: d.subcontractorId,
        technical_responsible_id: d.technicalResponsibleId,
        geom: toEwkt(d.geometry),
        address: blankToNull(d.address),
        street: blankToNull(d.street),
        district: blankToNull(d.district),
        segment_from: blankToNull(d.segmentFrom),
        segment_to: blankToNull(d.segmentTo),
        segment_start: d.segmentStart ? pointEwkt(d.segmentStart) : null,
        segment_end: d.segmentEnd ? pointEwkt(d.segmentEnd) : null,
        length_m: d.lengthM ? Number(d.lengthM) : null,
        description: d.description.trim(),
        scope: blankToNull(d.scope),
        construction_method: blankToNull(d.constructionMethod),
        affected_infrastructure: blankToNull(d.affectedInfrastructure),
        starts_on: blankToNull(d.startsOn),
        ends_on: blankToNull(d.endsOn),
      };

      let interventionId = d.interventionId;
      if (interventionId) {
        const { error } = await supabase
          .from('interventions').update(intervention).eq('id', interventionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('interventions').insert(intervention).select('id').single();
        if (error) throw error;
        interventionId = (data as { id: string }).id;
      }

      const license = {
        intervention_id: interventionId,
        purpose: blankToNull(d.purpose),
        schedule: d.schedule.length > 0 ? d.schedule : null,
      };

      let licenseId = d.licenseId;
      if (licenseId) {
        const { error } = await supabase.from('licenses').update(license).eq('id', licenseId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('licenses').insert(license).select('id').single();
        if (error) throw error;
        licenseId = (data as { id: string }).id;
      }

      return { interventionId, licenseId };
    },
    onSuccess: ({ interventionId, licenseId }) => {
      setDraft((d) => ({ ...d, interventionId, licenseId }));
      setLoadedFor(licenseId);
      qc.invalidateQueries({ queryKey: ['my-interventions'] });
      if (!licenseIdParam) navigate(`/empresa/licenciamento/${licenseId}`, { replace: true });
    },
  });

  const protocol = useMutation({
    mutationFn: async () => {
      if (!draft.licenseId) throw new Error('Grave o rascunho antes de protocolar.');
      const { error } = await supabase
        .from('licenses').update({ status: 'protocolada' }).eq('id', draft.licenseId);
      if (error) throw error;
      const { data, error: readError } = await supabase
        .from('licenses')
        .select('protocol_number, analysis_due_date, status')
        .eq('id', draft.licenseId).single();
      if (readError) throw readError;
      return data as { protocol_number: string; analysis_due_date: string; status: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-draft', draft.licenseId] });
      qc.invalidateQueries({ queryKey: ['my-interventions'] });
    },
  });

  // --- navegação entre etapas -----------------------------------------
  const goTo = async (target: number) => {
    if (target > step) {
      const found = validateStep(step, draft, uploadedKinds);
      setProblems(found);
      if (hasProblems(found)) return;
      // A partir da etapa 2 há o que gravar: geometria e descrição já
      // existem, que são as colunas obrigatórias da intervenção.
      if (step >= 2) {
        try {
          await save.mutateAsync(draft);
        } catch {
          return; // o erro aparece no ErrorNote; não avança
        }
      }
    } else {
      setProblems({});
    }
    setStep(target);
  };

  // --- guardas de acesso ----------------------------------------------
  if (!companyId) {
    return <Empty>Seu usuário não está vinculado a nenhuma empresa. Solicite o vínculo à SECONSER.</Empty>;
  }
  if (company.isLoading || types.isLoading || (licenseIdParam && existing.isLoading)) {
    return <Spinner />;
  }
  if (existing.error) return <ErrorNote error={existing.error} />;

  const c = company.data;
  const active = c ? isCadexActive(c.status as never, c.valid_until) : false;

  if (!active) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Pedido de licença de obra</h1>
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-900">
            Empresa sem CADEX ativo não requer licença (art. 8º, § 2º).
          </p>
          <p className="mt-1 text-sm text-red-800">
            Situação atual: <StatusBadge status={c?.status ?? null} />. Regularize a inscrição
            para voltar a protocolar pedidos.
          </p>
        </div>
      </div>
    );
  }

  const protocolled = existing.data?.license?.status
    && existing.data.license.status !== 'rascunho';

  if (protocolled || protocol.isSuccess) {
    return <Protocolled licenseId={draft.licenseId} result={protocol.data} existing={existing.data} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Pedido de licença de obra</h1>
        <p className="text-sm text-slate-600">
          {c?.legal_name} · {c ? formatCnpj(c.cnpj) : ''} — executora do art. 11
        </p>
      </header>

      <Stepper current={step} onPick={goTo} maxReached={draft.licenseId ? 6 : step} />

      <Card title={`Etapa ${step} de 6 — ${STEPS[step - 1].title}`}>
        <p className="mb-4 text-xs text-slate-500">{STEPS[step - 1].legend}</p>

        {step === 1 && (
          <StepIdentification
            draft={draft} set={set} problems={problems}
            types={types.data ?? []} responsibles={responsibles.data ?? []}
          />
        )}
        {step === 2 && <StepLocation draft={draft} set={set} problems={problems} />}
        {step === 3 && <StepScope draft={draft} set={set} problems={problems} />}
        {step === 4 && <StepSchedule draft={draft} set={set} problems={problems} />}
        {step === 5 && (
          <StepDocuments
            licenseId={draft.licenseId}
            documents={documents.data ?? []}
            loading={documents.isLoading}
            problems={problems}
            onChanged={() => qc.invalidateQueries({ queryKey: ['license-documents', draft.licenseId] })}
          />
        )}
        {step === 6 && (
          <StepReview
            draft={draft} documents={documents.data ?? []}
            types={types.data ?? []} uploaded={uploadedKinds}
          />
        )}

        <ErrorNote error={save.error ?? protocol.error} />

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={() => goTo(step - 1)} disabled={step === 1}>
            Voltar
          </Button>

          <div className="flex items-center gap-3">
            {draft.licenseId && (
              <span className="text-xs text-slate-500">
                {save.isPending ? 'gravando…' : 'rascunho gravado'}
              </span>
            )}
            {step < 6 ? (
              <Button onClick={() => goTo(step + 1)} disabled={save.isPending}>
                {step >= 2 ? 'Gravar e continuar' : 'Continuar'}
              </Button>
            ) : (
              <Button
                onClick={() => protocol.mutate()}
                disabled={protocol.isPending || hasProblems(validateAll(draft, uploadedKinds))}
              >
                {protocol.isPending ? 'Protocolando…' : 'Protocolar pedido'}
              </Button>
            )}
          </div>
        </footer>
      </Card>
    </div>
  );
}

// =====================================================================
// Etapas
// =====================================================================

type Setter = <K extends keyof LicenseDraft>(k: K, v: LicenseDraft[K]) => void;

interface StepProps {
  draft: LicenseDraft;
  set: Setter;
  problems: Problems;
}

function Problem({ of, problems }: { of: string; problems: Problems }) {
  if (!problems[of]) return null;
  return <p className="mt-1 text-xs text-red-700">{problems[of]}</p>;
}

// --- 1. Identificação --------------------------------------------------

function StepIdentification({
  draft, set, problems, types, responsibles,
}: StepProps & {
  types: { id: string; code: string; name: string }[];
  responsibles: {
    id: string; full_name: string; professional_body: string;
    registration_no: string; registration_uf: string | null;
  }[];
}) {
  return (
    <div className="space-y-5">
      <Field label="Tipo de obra de infraestrutura" required
             hint="Rol do art. 10. Se a atividade não modifica a estrutura da via, o caso é de manutenção rotineira (art. 15), que não exige licença.">
        <select className={inputClass} value={draft.typeId}
                onChange={(e) => set('typeId', e.target.value)}>
          <option value="">Selecione…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Problem of="typeId" problems={problems} />
      </Field>

      <Field label="Descrição da intervenção" required
             hint="Resumo do que será executado.">
        <textarea className={inputClass} rows={2} value={draft.description}
                  onChange={(e) => set('description', e.target.value)} />
        <Problem of="description" problems={problems} />
      </Field>

      <Field label="Finalidade do pedido" required
             hint="Por que a obra é necessária.">
        <input className={inputClass} value={draft.purpose}
               onChange={(e) => set('purpose', e.target.value)} />
        <Problem of="purpose" problems={problems} />
      </Field>

      <fieldset className="rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          Partes envolvidas (art. 11)
        </legend>
        <p className="mb-4 text-xs text-slate-500">
          Sua empresa entra como <strong>executora</strong>. Concessionária contratante e
          subcontratada são opcionais, mas, se informadas, precisam ter CADEX ativo — o
          banco recusa o contrário.
        </p>
        <div className="space-y-4">
          <CompanyPicker
            label="Concessionária contratante"
            cnpj={draft.concessionaireLabel}
            resolvedId={draft.concessionaireId}
            onChange={(cnpj, resolved) => {
              // `set` usa atualização funcional, então as três compõem.
              set('concessionaireLabel', cnpj);
              set('concessionaireId', resolved?.id ?? null);
              set('concessionaireName', resolved?.legal_name ?? '');
            }}
          />
          <Problem of="concessionaireId" problems={problems} />

          <CompanyPicker
            label="Empresa subcontratada"
            cnpj={draft.subcontractorLabel}
            resolvedId={draft.subcontractorId}
            onChange={(cnpj, resolved) => {
              set('subcontractorLabel', cnpj);
              set('subcontractorId', resolved?.id ?? null);
              set('subcontractorName', resolved?.legal_name ?? '');
            }}
          />
          <Problem of="subcontractorId" problems={problems} />
        </div>
      </fieldset>

      <Field label="Responsável técnico"
             hint={responsibles.length === 0
               ? 'Nenhum responsável técnico cadastrado na sua empresa.'
               : 'Profissional responsável por esta obra.'}>
        <select className={inputClass} value={draft.technicalResponsibleId ?? ''}
                onChange={(e) => set('technicalResponsibleId', e.target.value || null)}>
          <option value="">Não informado</option>
          {responsibles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name} — {r.professional_body} {r.registration_no}
              {r.registration_uf ? `/${r.registration_uf}` : ''}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function CompanyPicker({
  label, cnpj, resolvedId, onChange,
}: {
  label: string;
  cnpj: string;
  resolvedId: string | null;
  onChange: (cnpj: string, resolved: ResolvedCompany | null) => void;
}) {
  const [found, setFound] = useState<ResolvedCompany | null>(null);
  const [state, setState] = useState<'idle' | 'looking' | 'missing'>('idle');
  const lastQuery = useRef('');

  const digits = cnpj.replace(/\D/g, '');

  useEffect(() => {
    if (digits.length !== 14 || !isValidCnpj(digits)) {
      setFound(null);
      setState(digits.length === 0 ? 'idle' : 'idle');
      return;
    }
    if (lastQuery.current === digits) return;
    lastQuery.current = digits;
    let cancelled = false;

    (async () => {
      setState('looking');
      const { data } = await supabase.rpc('find_active_company_rpc', { p_cnpj: digits });
      if (cancelled) return;
      const row = (data as ResolvedCompany[] | null)?.[0] ?? null;
      setFound(row);
      setState(row ? 'idle' : 'missing');
      onChange(cnpj, row);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  return (
    <Field label={label} hint="Informe o CNPJ. A empresa precisa constar da relação de CADEX ativo (art. 7º, § 2º).">
      <input
        className={inputClass}
        value={cnpj}
        placeholder="00.000.000/0000-00"
        onChange={(e) => onChange(e.target.value, null)}
      />
      {digits.length === 14 && !isValidCnpj(digits) && (
        <p className="mt-1 text-xs text-red-700">CNPJ inválido — dígito verificador não confere.</p>
      )}
      {state === 'looking' && <p className="mt-1 text-xs text-slate-500">consultando…</p>}
      {state === 'missing' && (
        <p className="mt-1 text-xs text-red-700">
          Nenhuma empresa com CADEX ativo para este CNPJ.
        </p>
      )}
      {found && resolvedId && (
        <p className="mt-1 text-xs text-emerald-800">
          {found.legal_name} — CADEX {found.cadex_number ?? 'sem número'}
        </p>
      )}
    </Field>
  );
}

// --- 2. Localização ----------------------------------------------------

function StepLocation({ draft, set, problems }: StepProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file: File) => {
    setImportError(null);
    try {
      const result = await importGeometryFile(file);
      set('geometry', result.geometry);
      const length = approximateLengthM(result.geometry);
      if (length && !draft.lengthM) set('lengthM', String(length));
      if (result.featureCount > 1) {
        setImportError(
          `O arquivo traz ${result.featureCount} feições; foi usada a primeira utilizável. `
          + 'A licença é expedida individualmente por trecho ou projeto (art. 11).',
        );
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const drawKind =
    draft.geometry?.type === 'Point' ? 'Point'
    : draft.geometry?.type === 'Polygon' ? 'Polygon'
    : 'LineString';

  const suggestExtremes = () => {
    const ends = firstAndLast(draft.geometry);
    if (!ends) return;
    set('segmentStart', ends[0]);
    set('segmentEnd', ends[1]);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Logradouro" required>
          <input className={inputClass} value={draft.street}
                 onChange={(e) => set('street', e.target.value)} />
          <Problem of="street" problems={problems} />
        </Field>
        <Field label="Bairro" required>
          <input className={inputClass} value={draft.district}
                 onChange={(e) => set('district', e.target.value)} />
          <Problem of="district" problems={problems} />
        </Field>
      </div>

      <Field label="Endereço de referência" hint="Como aparecerá na consulta pública.">
        <input className={inputClass} value={draft.address}
               onChange={(e) => set('address', e.target.value)} />
      </Field>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-700">
            Geometria da intervenção <span className="text-red-600">*</span>
          </span>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".geojson,.json,.kml,application/geo+json,application/json,application/vnd.google-earth.kml+xml"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = '';
              }}
            />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              Importar GeoJSON ou KML
            </Button>
          </div>
        </div>

        <GeometryEditor
          kind={drawKind}
          geometry={draft.geometry}
          onGeometryChange={(g) => {
            set('geometry', g);
            const length = approximateLengthM(g);
            if (length) set('lengthM', String(length));
          }}
          segmentStart={draft.segmentStart}
          segmentEnd={draft.segmentEnd}
          onSegmentChange={(which, p) =>
            set(which === 'start' ? 'segmentStart' : 'segmentEnd', p)}
        />
        <Problem of="geometry" problems={problems} />
        {importError && (
          <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
            {importError}
          </p>
        )}
      </div>

      <fieldset className="rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          Trecho (art. 2º, VII)
        </legend>
        <p className="mb-4 text-xs text-slate-500">
          Trecho é “a extensão contínua de via, logradouro ou faixa de servidão objeto de uma
          única licença, delimitada por coordenadas geográficas de início e de fim”. Descrever
          o trecho sem as duas coordenadas não passa pelo banco.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Do" hint="Ex.: nº 100, esquina com a Rua X.">
            <input className={inputClass} value={draft.segmentFrom}
                   onChange={(e) => set('segmentFrom', e.target.value)} />
          </Field>
          <Field label="Ao" hint="Ex.: nº 300.">
            <input className={inputClass} value={draft.segmentTo}
                   onChange={(e) => set('segmentTo', e.target.value)} />
          </Field>

          <CoordinateField
            label="Coordenada de início" value={draft.segmentStart}
            onChange={(p) => set('segmentStart', p)}
          />
          <CoordinateField
            label="Coordenada de fim" value={draft.segmentEnd}
            onChange={(p) => set('segmentEnd', p)}
          />
        </div>

        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={suggestExtremes}
                  disabled={!firstAndLast(draft.geometry)}>
            Usar os extremos do traçado
          </Button>
        </div>
        <Problem of="segment" problems={problems} />
      </fieldset>

      <Field label="Extensão (m)"
             hint={`Estimativa a partir do desenho: ${
               approximateLengthM(draft.geometry) ?? '—'} m. Corrija com o valor do projeto.`}>
        <input className={inputClass} inputMode="numeric" value={draft.lengthM}
               onChange={(e) => set('lengthM', e.target.value)} />
        <Problem of="lengthM" problems={problems} />
      </Field>
    </div>
  );
}

function CoordinateField({
  label, value, onChange,
}: { label: string; value: LngLat | null; onChange: (p: LngLat | null) => void }) {
  const [text, setText] = useState(formatLatLng(value));
  const [bad, setBad] = useState(false);

  useEffect(() => { setText(formatLatLng(value)); }, [value]);

  return (
    <Field label={label} hint="latitude, longitude — ou clique no mapa acima.">
      <input
        className={inputClass}
        value={text}
        placeholder="-22.883200, -43.103600"
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === '') { setBad(false); onChange(null); return; }
          const parsed = parseLatLng(e.target.value);
          setBad(!parsed);
          if (parsed) onChange(parsed);
        }}
      />
      {bad && <p className="mt-1 text-xs text-red-700">Coordenada não reconhecida.</p>}
    </Field>
  );
}

// --- 3. Escopo ---------------------------------------------------------

function StepScope({ draft, set, problems }: StepProps) {
  return (
    <div className="space-y-5">
      <Field label="Escopo" required
             hint="Publicado na placa do canteiro e no QR Code (art. 14).">
        <textarea className={inputClass} rows={3} value={draft.scope}
                  onChange={(e) => set('scope', e.target.value)} />
        <Problem of="scope" problems={problems} />
      </Field>

      <Field label="Método construtivo" required
             hint="Ex.: céu aberto, método não destrutivo, travessia dirigida.">
        <input className={inputClass} value={draft.constructionMethod}
               onChange={(e) => set('constructionMethod', e.target.value)} />
        <Problem of="constructionMethod" problems={problems} />
      </Field>

      <Field label="Infraestrutura afetada"
             hint="Redes, pavimento, passeio, arborização e demais elementos atingidos.">
        <textarea className={inputClass} rows={3} value={draft.affectedInfrastructure}
                  onChange={(e) => set('affectedInfrastructure', e.target.value)} />
      </Field>
    </div>
  );
}

// --- 4. Cronograma -----------------------------------------------------

function StepSchedule({ draft, set, problems }: StepProps) {
  const update = (i: number, patch: Partial<ScheduleStage>) =>
    set('schedule', draft.schedule.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Se deferida, a licença vigora pelo prazo do cronograma aprovado (art. 13, parágrafo
        único). Quem fixa a vigência é a SECONSER no deferimento — o que você informa aqui é
        o prazo pedido.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Início previsto" required>
          <input type="date" className={inputClass} value={draft.startsOn}
                 onChange={(e) => set('startsOn', e.target.value)} />
          <Problem of="startsOn" problems={problems} />
        </Field>
        <Field label="Encerramento previsto" required
               hint="Publicado na placa do canteiro (art. 14).">
          <input type="date" className={inputClass} value={draft.endsOn}
                 onChange={(e) => set('endsOn', e.target.value)} />
          <Problem of="endsOn" problems={problems} />
        </Field>
      </div>

      <fieldset className="rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">Etapas do cronograma</legend>
        <p className="mb-3 text-xs text-slate-500">
          Detalhamento opcional aqui — o cronograma físico em si é o documento anexado na
          etapa 5, exigido pelo art. 12.
        </p>

        {draft.schedule.length === 0 && (
          <p className="mb-3 text-xs text-slate-500">Nenhuma etapa detalhada.</p>
        )}

        <ul className="space-y-3">
          {draft.schedule.map((s, i) => (
            <li key={i} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
              <Field label={`Etapa ${i + 1}`}>
                <input className={inputClass} value={s.stage}
                       onChange={(e) => update(i, { stage: e.target.value })} />
                <Problem of={`schedule.${i}.stage`} problems={problems} />
              </Field>
              <Field label="Início">
                <input type="date" className={inputClass} value={s.starts_on}
                       onChange={(e) => update(i, { starts_on: e.target.value })} />
              </Field>
              <Field label="Fim">
                <input type="date" className={inputClass} value={s.ends_on}
                       onChange={(e) => update(i, { ends_on: e.target.value })} />
                <Problem of={`schedule.${i}.ends_on`} problems={problems} />
              </Field>
              <Button type="button" variant="secondary"
                      onClick={() => set('schedule', draft.schedule.filter((_, j) => j !== i))}>
                Remover
              </Button>
            </li>
          ))}
        </ul>

        <div className="mt-4">
          <Button type="button" variant="secondary"
                  onClick={() => set('schedule', [
                    ...draft.schedule,
                    { stage: '', starts_on: draft.startsOn, ends_on: draft.endsOn },
                  ])}>
            Adicionar etapa
          </Button>
        </div>
      </fieldset>
    </div>
  );
}

// --- 5. Documentos -----------------------------------------------------

interface LicenseDocumentRow {
  id: string;
  kind: LicenseDocumentKind;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  created_at: string;
}

function StepDocuments({
  licenseId, documents, loading, problems, onChanged,
}: {
  licenseId: string | null;
  documents: LicenseDocumentRow[];
  loading: boolean;
  problems: Problems;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (!licenseId) {
    return <Empty>Conclua as etapas anteriores para que o rascunho seja gravado e receba anexos.</Empty>;
  }

  const upload = async (kind: LicenseDocumentKind, file: File) => {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(new Error(`Arquivo acima do limite de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`));
      return;
    }
    if (file.type && !ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      setError(new Error(`Tipo de arquivo não aceito: ${file.type}.`));
      return;
    }
    setBusy(kind);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = `${licenseId}/${kind}-${Date.now()}-${safe}`;
      const up = await supabase.storage
        .from(BUCKETS.licenseDocuments)
        .upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (up.error) throw up.error;

      const { error: insertError } = await supabase.from('license_documents').insert({
        license_id: licenseId,
        kind,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
      });
      if (insertError) {
        // Não deixa o arquivo órfão no bucket se a linha não entrou.
        await supabase.storage.from(BUCKETS.licenseDocuments).remove([path]);
        throw insertError;
      }
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (doc: LicenseDocumentRow) => {
    setError(null);
    setBusy(doc.id);
    try {
      const { error: delError } = await supabase
        .from('license_documents').delete().eq('id', doc.id);
      if (delError) throw delError;
      await supabase.storage.from(BUCKETS.licenseDocuments).remove([doc.storage_path]);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const open = async (doc: LicenseDocumentRow) => {
    setError(null);
    const { data, error: signError } = await supabase.storage
      .from(BUCKETS.licenseDocuments).createSignedUrl(doc.storage_path, 60);
    if (signError) { setError(signError); return; }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Os três primeiros são exigência do art. 12 e o protocolo é recusado sem eles. Os
        arquivos ficam em bucket privado: quem abre recebe um link assinado de curta duração,
        nunca uma URL pública.
      </div>

      {loading && <Spinner />}
      <ErrorNote error={error} />

      <ul className="space-y-4">
        {LICENSE_DOCUMENTS.map((spec) => {
          const mine = documents.filter((d) => d.kind === spec.kind);
          return (
            <li key={spec.kind} className="rounded-md border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {spec.label}
                    {spec.required && <span className="ml-1 text-red-600" aria-hidden>*</span>}
                    {spec.legalBasis && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                        {spec.legalBasis}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{spec.hint}</p>
                </div>
                <label className="shrink-0">
                  <span className="sr-only">Anexar {spec.label}</span>
                  <input
                    type="file" className="hidden"
                    disabled={busy === spec.kind}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(spec.kind, f);
                      e.target.value = '';
                    }}
                  />
                  <span className="inline-flex cursor-pointer items-center rounded-md bg-white px-3 py-2 text-sm
                                   font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                    {busy === spec.kind ? 'Enviando…' : 'Anexar'}
                  </span>
                </label>
              </div>

              {mine.length === 0 ? (
                <p className={`mt-3 text-xs ${spec.required ? 'text-red-700' : 'text-slate-500'}`}>
                  {problems[spec.kind] ?? (spec.required ? 'Pendente.' : 'Nenhum arquivo.')}
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {mine.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <button type="button" onClick={() => void open(d)}
                              className="font-medium text-gov-700 underline underline-offset-2">
                        {d.file_name}
                      </button>
                      <span className="text-xs text-slate-500">
                        {(d.file_size / 1024).toFixed(0)} kB
                      </span>
                      <button type="button" onClick={() => void remove(d)}
                              disabled={busy === d.id}
                              className="ml-auto text-xs text-red-700 underline underline-offset-2 disabled:opacity-50">
                        {busy === d.id ? 'removendo…' : 'remover'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- 6. Revisão --------------------------------------------------------

function StepReview({
  draft, documents, types, uploaded,
}: {
  draft: LicenseDraft;
  documents: LicenseDocumentRow[];
  types: { id: string; name: string }[];
  uploaded: Set<string>;
}) {
  const problems = validateAll(draft, uploaded);
  const typeName = types.find((t) => t.id === draft.typeId)?.name ?? '—';

  return (
    <div className="space-y-5">
      {hasProblems(problems) ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-900">
            O pedido ainda não pode ser protocolado:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
            {Object.entries(problems).map(([k, v]) => <li key={k}>{v}</li>)}
          </ul>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Pedido instruído. Ao protocolar, o sistema atribui o número e conta os 20 dias úteis
          do art. 13 — prazo que não se suspende durante diligência.
        </div>
      )}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Review label="Tipo de obra (art. 10)" value={typeName} />
        <Review label="Finalidade" value={draft.purpose} />
        <Review label="Descrição" value={draft.description} />
        <Review label="Escopo (art. 14)" value={draft.scope} />
        <Review label="Método construtivo" value={draft.constructionMethod} />
        <Review label="Infraestrutura afetada" value={draft.affectedInfrastructure} />
        <Review label="Logradouro" value={`${draft.street}${draft.district ? ` — ${draft.district}` : ''}`} />
        <Review label="Geometria (art. 27)" value={describeGeometry(draft.geometry)} />
        <Review label="Trecho (art. 2º, VII)"
                value={draft.segmentFrom || draft.segmentTo
                  ? `${draft.segmentFrom || '—'} → ${draft.segmentTo || '—'}`
                  : 'não delimitado por descrição'} />
        <Review label="Coordenadas do trecho"
                value={draft.segmentStart && draft.segmentEnd
                  ? `${formatLatLng(draft.segmentStart)} → ${formatLatLng(draft.segmentEnd)}`
                  : '—'} />
        <Review label="Extensão" value={draft.lengthM ? `${draft.lengthM} m` : '—'} />
        <Review label="Prazo pedido"
                value={draft.startsOn && draft.endsOn
                  ? `${brDate(draft.startsOn)} a ${brDate(draft.endsOn)}`
                  : '—'} />
        <Review label="Concessionária contratante"
                value={partyLabel(draft.concessionaireName, draft.concessionaireLabel)} />
        <Review label="Subcontratada"
                value={partyLabel(draft.subcontractorName, draft.subcontractorLabel)} />
      </dl>

      <div>
        <p className="text-sm font-medium text-slate-700">Instrução do pedido (art. 12)</p>
        <ul className="mt-2 space-y-1 text-sm">
          {LICENSE_DOCUMENTS.map((spec) => {
            const count = documents.filter((d) => d.kind === spec.kind).length;
            const missing = spec.required && count === 0;
            return (
              <li key={spec.kind} className={missing ? 'text-red-700' : 'text-slate-700'}>
                {count > 0 ? '✓' : missing ? '✗' : '–'} {spec.label}
                <span className="text-slate-500">
                  {count > 0 ? ` — ${count} arquivo(s)`
                    : missing ? ' — exigido pelo art. 12'
                    : ' — não enviado (facultativo)'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value || '—'}</dd>
    </div>
  );
}

// --- protocolado -------------------------------------------------------

function Protocolled({
  licenseId, result, existing,
}: {
  licenseId: string | null;
  result: { protocol_number: string; analysis_due_date: string; status: string } | undefined;
  existing: LicenseDraftPayload | undefined;
}) {
  const navigate = useNavigate();
  const number = result?.protocol_number ?? existing?.license?.protocol_number ?? null;
  const due = result?.analysis_due_date ?? existing?.license?.analysis_due_date ?? null;
  const status = result?.status ?? existing?.license?.status ?? 'protocolada';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Pedido de licença protocolado</h1>

      <Card title="Protocolo">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Review label="Número do protocolo" value={number ?? '—'} />
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Situação</dt>
            <dd className="mt-0.5"><StatusBadge status={status} /></dd>
          </div>
          <Review label="Prazo de decisão (art. 13)" value={due ? brDate(due) : '—'} />
          <Review label="Identificador interno" value={licenseId ?? '—'} />
        </dl>

        <p className="mt-4 text-sm text-slate-600">
          O prazo de 20 dias úteis corre do protocolo e não se suspende durante diligência
          (decisão do art. 30 registrada em <code>normative_decisions</code>). A obra não pode
          iniciar antes do deferimento — o banco recusa (art. 11).
        </p>

        <div className="mt-5 flex gap-3">
          <Button onClick={() => navigate('/empresa')}>Voltar ao painel</Button>
        </div>
      </Card>
    </div>
  );
}

// =====================================================================
// Apoio
// =====================================================================

function Stepper({
  current, onPick, maxReached,
}: { current: number; onPick: (n: number) => void; maxReached: number }) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Etapas do pedido">
      {STEPS.map((s) => {
        const state = s.id === current ? 'current' : s.id <= maxReached ? 'done' : 'todo';
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => (state === 'todo' ? undefined : onPick(s.id))}
              disabled={state === 'todo'}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition
                ${state === 'current'
                  ? 'bg-gov-700 text-white ring-gov-700'
                  : state === 'done'
                    ? 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50'
                    : 'bg-slate-50 text-slate-400 ring-slate-200'}`}
            >
              {s.id}. {s.title}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

interface ResolvedCompany {
  id: string;
  cnpj: string;
  legal_name: string;
  trade_name: string | null;
  cadex_number: string | null;
  status: string;
  valid_until: string | null;
}

interface LicenseDraftPayload {
  license: {
    id: string; status: string; purpose: string | null;
    protocol_number: string | null; analysis_due_date: string | null;
    schedule: ScheduleStage[] | null;
  };
  intervention: Record<string, unknown> & { id: string };
  geometry: GeoJSON.Geometry | null;
  segment_start: GeoJSON.Point | null;
  segment_end: GeoJSON.Point | null;
  documents: LicenseDocumentRow[];
}

function fromPayload(p: LicenseDraftPayload): LicenseDraft {
  const i = p.intervention;
  const str = (k: string): string => {
    const v = i[k];
    return typeof v === 'string' ? v : v == null ? '' : String(v);
  };
  const uuid = (k: string): string | null => {
    const v = i[k];
    return typeof v === 'string' ? v : null;
  };
  const point = (g: GeoJSON.Point | null): LngLat | null =>
    g ? { lng: g.coordinates[0], lat: g.coordinates[1] } : null;

  return {
    ...emptyDraft(),
    interventionId: i.id,
    licenseId: p.license.id,
    typeId: uuid('type_id') ?? '',
    description: str('description'),
    purpose: p.license.purpose ?? '',
    concessionaireId: uuid('concessionaire_id'),
    concessionaireLabel: party(i, 'concessionaire', 'cnpj'),
    concessionaireName: party(i, 'concessionaire', 'legal_name'),
    subcontractorId: uuid('subcontractor_id'),
    subcontractorLabel: party(i, 'subcontractor', 'cnpj'),
    subcontractorName: party(i, 'subcontractor', 'legal_name'),
    technicalResponsibleId: uuid('technical_responsible_id'),
    geometry: p.geometry,
    address: str('address'),
    street: str('street'),
    district: str('district'),
    segmentFrom: str('segment_from'),
    segmentTo: str('segment_to'),
    segmentStart: point(p.segment_start),
    segmentEnd: point(p.segment_end),
    lengthM: str('length_m'),
    scope: str('scope'),
    constructionMethod: str('construction_method'),
    affectedInfrastructure: str('affected_infrastructure'),
    startsOn: str('starts_on'),
    endsOn: str('ends_on'),
    schedule: p.license.schedule ?? [],
  };
}

const blankToNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/**
 * As partes do art. 11 não são relidas do cadastro alheio — a RLS o
 * esconde da requerente. Vêm do `snapshot`, que o banco congela no
 * registro justamente para preservar quem era quem naquele momento.
 */
function party(
  intervention: Record<string, unknown>, role: string, field: string,
): string {
  const snap = intervention.snapshot;
  if (!snap || typeof snap !== 'object') return '';
  const node = (snap as Record<string, unknown>)[role];
  if (!node || typeof node !== 'object') return '';
  const value = (node as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

const partyLabel = (name: string, cnpj: string): string => {
  if (!name && !cnpj) return '—';
  const formatted = cnpj ? formatCnpj(cnpj) : '';
  return name && formatted ? `${name} — ${formatted}` : name || formatted;
};

const brDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR');
