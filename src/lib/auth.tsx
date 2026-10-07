import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { registrarAtividade } from './sessao';
import { supabase } from './supabase';

export type Papel = 'gestor' | 'cisp' | 'licenciador';

export const PAPEL_LABEL: Record<Papel, string> = {
  gestor: 'SECONSER',
  cisp: 'CISP',
  licenciador: 'Licenciamento',
};

export interface Servidor {
  nome: string;
  papel: Papel;
  /** Gerencia as contas e os perfis de acesso. */
  administrador: boolean;
}

/** Verificação em duas etapas (aplicativo autenticador) da sessão atual. */
export interface EstadoMfa {
  /** O gestor só usa o sistema depois do código do aplicativo; o CISP não precisa. */
  exigida: boolean;
  /** O aplicativo já foi cadastrado (fator confirmado). */
  cadastrada: boolean;
  /** Esta sessão já passou pelo código do aplicativo (nível aal2). */
  confirmada: boolean;
  /** Fator a usar no pedido do código. */
  fatorId: string | null;
}

interface AuthState {
  session: Session | null;
  mfa: EstadoMfa | null;
  /** Servidor logado, ou null se o usuário não for servidor. */
  servidor: Servidor | null;
  /** Só o gestor (SECONSER) cadastra e altera empresas/inscrições; o CISP consulta. */
  podeEditar: boolean;
  /** Gestor ou licenciador: registra e atualiza licenças de obra. */
  podeLicenciar: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Sai só neste navegador. */
  signOut: () => Promise<void>;
  /** Encerra a sessão em todos os computadores e celulares. */
  signOutTodos: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [servidor, setServidor] = useState<Servidor | null>(null);
  const [mfa, setMfa] = useState<EstadoMfa | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async (s: Session | null) => {
      let sv: Servidor | null = null;
      if (s) {
        // Quem é servidor, e com que perfil, vem do banco sob RLS — nunca do
        // navegador. O banco aplica as mesmas regras em cada gravação.
        const { data } = await supabase
          .from('servidores').select('nome, papel, administrador').eq('user_id', s.user.id).maybeSingle();
        sv = (data as Servidor | null) ?? null;
      }
      let m: EstadoMfa | null = null;
      if (sv) {
        const [nivel, fatores] = await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors(),
        ]);
        // `totp` só traz fatores confirmados; um cadastro abandonado no meio não conta.
        const fator = fatores.data?.totp[0] ?? null;
        m = {
          exigida: sv.papel === 'gestor' || sv.papel === 'licenciador',
          cadastrada: Boolean(fator),
          confirmada: nivel.data?.currentLevel === 'aal2',
          fatorId: fator?.id ?? null,
        };
      }
      if (!cancelled) { setServidor(sv); setMfa(m); setLoading(false); }
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
    session, servidor, mfa, loading, podeEditar: servidor?.papel === 'gestor',
    podeLicenciar: servidor?.papel === 'gestor' || servidor?.papel === 'licenciador',
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      registrarAtividade();
    },
    // O padrão do Supabase é 'global'; "Sair" encerra só este navegador.
    signOut: async () => { await supabase.auth.signOut({ scope: 'local' }); },
    signOutTodos: async () => {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw error;
    },
  }), [session, servidor, mfa, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora de AuthProvider');
  return ctx;
}
