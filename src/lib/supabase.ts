import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * O app não tem fallback para dados simulados (§38). Sem backend
 * configurado ele falha de forma explícita, em vez de fingir funcionar.
 */
export const isConfigured = Boolean(url && anonKey);

if (!isConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.error(
    'CADEX: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ausentes. ' +
      'Copie .env.example para .env — ver ENVIRONMENT.md.',
  );
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Buckets de Storage. Todos privados; acesso por signed URL (§35, §36). */
export const BUCKETS = {
  companyDocuments: 'company-documents',
  licenseDocuments: 'license-documents',
  inspectionPhotos: 'inspection-photos',
  emergencyPhotos: 'emergency-photos',
  asBuilt: 'as-built',
  badges: 'badges',
} as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // §35

export const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/geo+json',
  'application/vnd.google-earth.kml+xml',
  'application/vnd.google-earth.kmz',
  'application/zip',
];
