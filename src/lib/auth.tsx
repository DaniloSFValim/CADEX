import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** Acesso ativo. Desativado, a pessoa não é tratada como servidora. */
  ativo: boolean;
  /** Dados funcionais: saem no documento emitido como responsável pela emissão. */
  matricula: string | null;
  cargo: string | null;
}

/** Representante (ou operador) de uma empresa: acesso ao portal das empresas. Não é servidor. */
export interface AcessoEmpresa {
  empresaId: string;
  papel: 'representante' | 'operador';
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
  /** Acesso de empresa ativo, ou null. Servidor e empresa não coexistem (o banco impede). */
  empresa: AcessoEmpresa | null;
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
  const ultimoUsuario = useRef<string | null>(null);
  const [servidor, setServidor] = useState<Servidor | null>(null);
  const [empresa, setEmpresa] = useState<AcessoEmpresa | null>(null);
  const [mfa, setMfa] = useState<EstadoMfa | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async (s: Session | null) => {
      let sv: Servidor | null = null;
      let ea: AcessoEmpresa | null = null;
      if (s) {
        // Quem é servidor, e com que perfil, vem do banco sob RLS — nunca do
        // navegador. O banco aplica as mesmas regras em cada gravação.
        const { data } = await supabase
          .from('servidores').select('nome, papel, administrador, ativo, matricula, cargo').eq('user_id', s.user.id).maybeSingle();
        const linha = (data as Servidor | null) ?? null;
        // Acesso desativado vale como sem acesso: o banco já recusa tudo, e a tela não finge o contrário.
        sv = linha?.ativo === false ? null : linha;
        // Sem cadastro de servidor, procura o acesso de empresa (portal das empresas).
        if (!sv) {
          const { data: vinculo } = await supabase
            .from('empresa_usuarios').select('empresa_id, papel, ativo').eq('user_id', s.user.id).maybeSingle();
          const v = vinculo as { empresa_id: string; papel: AcessoEmpresa['papel']; ativo: boolean } | null;
          ea = v?.ativo === true ? { empresaId: v.empresa_id, papel: v.papel } : null;
        }
      }
      let m: EstadoMfa | null = null;
      if (sv || ea) {
        const [nivel, fatores] = await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors(),
        ]);
        // `totp` só traz fatores confirmados; um cadastro abandonado no meio não conta.
        const fator = fatores.data?.totp[0] ?? null;
        m = {
          // Empresa também usa verificação em duas etapas: o banco exige aal2 para tudo.
          exigida: sv ? (sv.papel === 'gestor' || sv.papel === 'licenciador') : true,
          cadastrada: Boolean(fator),
          confirmada: nivel.data?.currentLevel === 'aal2',
          fatorId: fator?.id ?? null,
        };
      }
      if (!cancelled) { setServidor(sv); setEmpresa(ea); setMfa(m); setLoading(false); }
    };

    supabase.auth.getSession().then(({ data }) => {
      ultimoUsuario.current = data.session?.user.id ?? null;
      setSession(data.session);
      void load(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s);
      // Voltar para a aba renova o token e emite SIGNED_IN ou TOKEN_REFRESHED
      // com o mesmo usuário. Recarregar nesse momento põe a área em "carregando"
      // e desmonta as telas: o que estava sendo digitado se perde. Só troca de
      // usuário e a confirmação do MFA (MFA_CHALLENGE_VERIFIED) recarregam o perfil.
      const mesmoUsuario = s?.user.id === ultimoUsuario.current;
      if (mesmoUsuario && (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED' || evento === 'INITIAL_SESSION')) return;
      ultimoUsuario.current = s?.user.id ?? null;
      setLoading(true);
      void load(s);
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthState>(() => ({
    session, servidor, empresa, mfa, loading, podeEditar: servidor?.papel === 'gestor',
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
  }), [session, servidor, empresa, mfa, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora de AuthProvider');
  return ctx;
}
