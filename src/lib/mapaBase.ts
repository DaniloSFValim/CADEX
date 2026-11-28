import { supabase } from './supabase';

/**
 * Camadas de mapa-base que a Administração pode escolher para o mapa público.
 * Só entram provedores cuja política de uso permite tráfego de site público.
 */
export const MAPAS_BASE = {
  topo: {
    rotulo: 'Topográfico (padrão)',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  },
  ruas: {
    rotulo: 'Ruas',
    url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  },
} as const;

export type CamadaBase = keyof typeof MAPAS_BASE;
export const CAMADAS_BASE = Object.keys(MAPAS_BASE) as CamadaBase[];

/** Camada atual do mapa público. Se falhar, cai no padrão, para o mapa nunca ficar sem base. */
export async function lerMapaBase(): Promise<CamadaBase> {
  try {
    const { data, error } = await supabase.rpc('mapa_base_publico');
    if (error || !data) return 'topo';
    return (CAMADAS_BASE as string[]).includes(data) ? (data as CamadaBase) : 'topo';
  } catch {
    return 'topo';
  }
}

export async function definirMapaBase(camada: CamadaBase): Promise<void> {
  const { error } = await supabase.rpc('definir_mapa_base', { p_camada: camada });
  if (error) throw error;
}
