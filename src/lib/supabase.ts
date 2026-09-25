import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Sem as variáveis o app avisa na tela em vez de fingir que funciona. */
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Bucket privado dos documentos; leitura só por link temporário. */
export const BUCKET = 'documentos';
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Bucket público dos logos das empresas (aparecem na consulta pública). */
export const BUCKET_LOGOS = 'logos';
