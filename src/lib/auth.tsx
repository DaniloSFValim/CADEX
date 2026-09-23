import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Role =
  | 'admin' | 'gestor_seconser' | 'analista_seconser'
  | 'fiscal_viario' | 'guarda_civil' | 'empresa' | 'cisp_seop';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador do sistema',
  gestor_seconser: 'Gestor SECONSER',
  analista_seconser: 'Analista SECONSER',
  fiscal_viario: 'Fiscal do Sistema Viário',
  guarda_civil: 'Guarda Civil Municipal',
  empresa: 'Empresa',
  cisp_seop: 'CISP / SEOP',
};

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  org_unit: string | null;
  company_id: string | null;
  active: boolean;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  roles: Role[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  has: (...roles: Role[]) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async (s: Session | null) => {
      if (!s) {
        if (!cancelled) { setProfile(null); setRoles([]); setLoading(false); }
        return;
      }
      // Perfil e papéis vêm do banco sob RLS — nunca do token nem do cliente.
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', s.user.id),
      ]);
      if (cancelled) return;
      setProfile((p as Profile) ?? null);
      setRoles(((r ?? []) as { role: Role }[]).map((x) => x.role));
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void load(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(true);
      void load(s);
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthState>(() => ({
    session, profile, roles, loading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signOut: async () => { await supabase.auth.signOut(); },
    has: (...want) => want.some((r) => roles.includes(r)),
  }), [session, profile, roles, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora de AuthProvider');
  return ctx;
}

/** Rota inicial de cada perfil (§40, §41). */
export function homeFor(roles: Role[]): string {
  if (roles.includes('admin') || roles.includes('gestor_seconser')) return '/telecom';
  if (roles.includes('fiscal_viario') || roles.includes('guarda_civil')) return '/campo';
  if (roles.includes('empresa')) return '/empresa';
  if (roles.includes('cisp_seop')) return '/cisp';
  if (roles.length > 0) return '/admin';
  return '/';
}
