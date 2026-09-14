import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button, Card, ErrorNote, Empty, Field, inputClass, StatusBadge } from '../../components/ui';
import { MapView } from '../../components/MapView';
import { formatCnpj } from '../../lib/rules';
import type { PublicIntervention } from '../../lib/map';

/**
 * §41 — Tela inicial do fiscal. Otimizada para celular: alvos grandes,
 * poucas camadas de navegação, consulta em um toque.
 */
export default function FieldHome() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'proximas' | 'buscar'>('proximas');
  const [term, setTerm] = useState('');
  const [applied, setApplied] = useState('');
  const [pos, setPos] = useState<{ lng: number; lat: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const near = useQuery({
    queryKey: ['near', pos?.lng, pos?.lat],
    enabled: !!pos,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('interventions_near', {
        p_lng: pos!.lng, p_lat: pos!.lat, p_radius_m: 1000,
      });
      if (error) throw error;
      return (data ?? []) as PublicIntervention[];
    },
  });

  const search = useQuery({
    queryKey: ['field-search', applied],
    enabled: mode === 'buscar' && applied.trim().length > 1,
    queryFn: async () => {
      const digits = applied.replace(/\D/g, '');
      const [companies, interventions, vehicles] = await Promise.all([
        supabase
          .from('companies')
          .select('id, legal_name, cnpj, cadex_number, status, valid_until')
          .or(
            digits.length >= 8
              ? `cnpj.eq.${digits}`
              : `legal_name.ilike.%${applied}%,cadex_number.ilike.%${applied}%`,
          )
          .limit(20),
        supabase
          .from('public_interventions')
          .select('*')
          .or(
            `license_number.ilike.%${applied}%,declaration_number.ilike.%${applied}%,` +
            `street.ilike.%${applied}%,executor_name.ilike.%${applied}%`,
          )
          .limit(20),
        supabase
          .from('vehicles')
          .select('id, plate, kind, identification, active, valid_until, companies(legal_name, cadex_number, status)')
          .ilike('plate', `%${applied.replace(/\W/g, '')}%`)
          .limit(20),
      ]);
      if (companies.error) throw companies.error;
      return {
        companies: companies.data ?? [],
        interventions: (interventions.data ?? []) as PublicIntervention[],
        vehicles: vehicles.data ?? [],
      };
    },
  });

  const locate = () => {
    setGeoError(null);
    if (!navigator.geolocation) { setGeoError('Geolocalização indisponível neste dispositivo.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lng: p.coords.longitude, lat: p.coords.latitude }),
      (e) => setGeoError(`Não foi possível obter a localização: ${e.message}`),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Fiscalização em campo</h1>

      <div className="grid grid-cols-2 gap-3">
        <Button onClick={locate} className="h-14 text-base">Intervenções próximas</Button>
        <Button variant="secondary" className="h-14 text-base" onClick={() => setMode('buscar')}>
          Consultar
        </Button>
        <Link
          to="/campo/fiscalizacao"
          className="col-span-2 flex h-14 items-center justify-center rounded-md bg-gov-800 text-base font-medium text-white"
        >
          Registrar fiscalização
        </Link>
      </div>

      {geoError && <ErrorNote error={new Error(geoError)} />}

      {mode === 'buscar' && (
        <Card title="Consulta rápida">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => { e.preventDefault(); setApplied(term); }}
          >
            <div className="min-w-[220px] flex-1">
              <Field label="CNPJ, CADEX, placa, licença, protocolo ou logradouro">
                <input
                  className={inputClass}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  autoComplete="off"
                  inputMode="search"
                />
              </Field>
            </div>
            <Button type="submit">Buscar</Button>
          </form>

          <ErrorNote error={search.error} />

          {search.data && (
            <div className="mt-4 space-y-4">
              <SearchGroup title="Empresas">
                {search.data.companies.map((c: any) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="font-medium">{c.legal_name}</span>
                    <span className="tabular-nums text-slate-600">{formatCnpj(c.cnpj)}</span>
                    <span className="font-mono text-xs text-slate-500">{c.cadex_number}</span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </SearchGroup>

              <SearchGroup title="Veículos">
                {search.data.vehicles.map((v: any) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="font-mono font-medium">{v.plate}</span>
                    <span className="text-slate-600">{v.kind}</span>
                    <span className="text-slate-600">{v.companies?.legal_name}</span>
                    <StatusBadge status={v.companies?.status} />
                  </li>
                ))}
              </SearchGroup>

              <SearchGroup title="Intervenções">
                {search.data.interventions.map((i) => (
                  <li key={i.public_token} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="font-medium">{i.executor_name}</span>
                    <span className="font-mono text-xs">{i.license_number ?? i.declaration_number}</span>
                    <StatusBadge status={i.status} />
                    <button
                      onClick={() => navigate(`/campo/fiscalizacao/${i.public_token}`)}
                      className="ml-auto text-gov-700 underline-offset-2 hover:underline"
                    >
                      Fiscalizar
                    </button>
                  </li>
                ))}
              </SearchGroup>
            </div>
          )}
        </Card>
      )}

      {pos && (
        <Card title={`Intervenções em 1 km${near.data ? ` (${near.data.length})` : ''}`}>
          <ErrorNote error={near.error} />
          {near.data?.length === 0 && <Empty>Nenhuma intervenção registrada nas proximidades.</Empty>}
          {(near.data?.length ?? 0) > 0 && (
            <>
              <MapView items={near.data!} className="h-[320px]" />
              <ul className="mt-3 divide-y divide-slate-100">
                {near.data!.map((i) => (
                  <li key={i.public_token} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="font-medium">{i.executor_name}</span>
                    <span className="text-slate-600">{i.street}</span>
                    <StatusBadge status={i.status} />
                    {i.executor_cadex_active === false && (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300">
                        executora sem CADEX ativo
                      </span>
                    )}
                    <Link
                      to={`/campo/fiscalizacao/${i.public_token}`}
                      className="ml-auto text-gov-700 underline-offset-2 hover:underline"
                    >
                      Fiscalizar
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function SearchGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  if (items.flat().filter(Boolean).length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </div>
  );
}
