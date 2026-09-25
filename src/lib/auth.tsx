import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Papel = 'gestor' | 'cisp';

export const PAPEL_LABEL: Record<Papel, string> = {
  gestor: 'SECONSER',
  cisp: 'CISP — consulta',
};

export interface Servidor { nome: string; papel: Papel }

interface AuthState {
  session: Session | null;
  /** Servidor logado, ou null se o usuário não for servidor. */
  servidor: Servidor | null;
  /** Só o gestor (SECONSER) cadastra e altera; o CISP consulta. */
  podeEditar: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [servidor, setServidor] = useState<Servidor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async (s: Session | null) => {
      let sv: Servidor | null = null;
      if (s) {
        // Quem é servidor, e com que perfil, vem do banco sob RLS — nunca do
        // navegador. O banco aplica as mesmas regras em cada gravação.
        const { data } = await supabase
          .from('servidores').select('nome, papel').eq('user_id', s.user.id).maybeSingle();
        sv = (data as Servidor | null) ?? null;
      }
      if (!cancelled) { setServidor(sv); setLoading(false); }
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
    session, servidor, loading, podeEditar: servidor?.papel === 'gestor',
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signOut: async () => { await supabase.auth.signOut(); },
  }), [session, servidor, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora de AuthProvider');
  return ctx;
}
