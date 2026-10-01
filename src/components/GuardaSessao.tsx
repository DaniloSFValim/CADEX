import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import {
  estadoSessao, guardarMotivo, lerAtividade, limparAtividade, registrarAtividade, type EstadoSessao,
} from '../lib/sessao';
import { Button } from './ui';

const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove'] as const;
/** Grava a atividade no máximo a cada 15 s: evita escrever a cada movimento do mouse. */
const INTERVALO_GRAVACAO = 15 * 1000;

/**
 * Encerra a sessão do servidor parado (30 min) ou aberto há mais de 12 h,
 * com aviso no último minuto. Só age com alguém conectado.
 */
export function GuardaSessao() {
  const { session, signOut } = useAuth();
  const [estado, setEstado] = useState<EstadoSessao>({ tipo: 'ativa' });
  const login = session?.user.last_sign_in_at ? Date.parse(session.user.last_sign_in_at) : null;

  useEffect(() => {
    if (!session) { setEstado({ tipo: 'ativa' }); return; }
    let ultimaGravacao = 0;
    const anotar = () => {
      const agora = Date.now();
      if (agora - ultimaGravacao < INTERVALO_GRAVACAO) return;
      ultimaGravacao = agora;
      registrarAtividade(agora);
    };
    const verificar = () => {
      const e = estadoSessao(Date.now(), lerAtividade(), login);
      setEstado(e);
      if (e.tipo === 'expirada') {
        guardarMotivo(e.motivo);
        limparAtividade();
        void signOut();
      }
    };
    // Abrir ou recarregar a página não conta como uso: só clique, tecla e
    // movimento. Sem registro nenhum (primeiro acesso), começa a contar agora.
    if (lerAtividade() === null) registrarAtividade();
    verificar();
    EVENTOS.forEach((ev) => window.addEventListener(ev, anotar, { passive: true }));
    const relogio = window.setInterval(verificar, 1000);
    const aoVoltar = () => { if (document.visibilityState === 'visible') verificar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      EVENTOS.forEach((ev) => window.removeEventListener(ev, anotar));
      window.clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [session, login, signOut]);

  if (!session || estado.tipo !== 'aviso') return null;
  const segundos = Math.ceil(estado.restanteMs / 1000);
  const porLimite = estado.motivo === 'limite';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta-900/40 px-4" role="alertdialog"
         aria-modal="true" aria-labelledby="sessao-titulo" aria-describedby="sessao-texto">
      <div className="cartao w-full max-w-md p-6">
        <h2 id="sessao-titulo" className="text-xl font-semibold text-tinta-900">
          A sessão termina em <span className="tabular">{segundos}</span> s
        </h2>
        <p id="sessao-texto" className="mt-2 text-sm text-tinta-600">
          {porLimite
            ? 'Por segurança, a sessão vale 12 horas a partir do login. Salve o que estiver fazendo; depois entre de novo.'
            : 'O CADEX ficou 30 minutos sem uso. Para continuar conectado, confirme abaixo.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {!porLimite && (
            <Button autoFocus onClick={() => { registrarAtividade(); setEstado({ tipo: 'ativa' }); }}>
              Continuar conectado
            </Button>
          )}
          <Button variant="secondary" onClick={() => { limparAtividade(); void signOut(); }}>
            Sair agora
          </Button>
        </div>
      </div>
    </div>
  );
}
