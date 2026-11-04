import { useState } from 'react';
import { Button, ErrorNote } from './ui';
import { useAuth } from '../lib/auth';
import { definirEmitidaEmSistemaAnterior, type LicencaComTrechos } from '../lib/licencas';

/**
 * Registro de licença já emitida fora do CADEX. Não há PDF, prévia nem QR Code: a licença
 * é só o registro dos dados. Quem grava licenças pode marcar ou desmarcar.
 */
export function RegistroAnterior({ licenca, onMudou }: { licenca: LicencaComTrechos; onMudou: () => Promise<void> }) {
  const { podeLicenciar } = useAuth();
  const [confirmando, setConfirmando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  const marcar = async (valor: boolean) => {
    setBusy(true);
    setErro(null);
    try {
      await definirEmitidaEmSistemaAnterior(licenca.id, valor);
      setConfirmando(false);
      await onMudou();
    } catch (e) {
      setErro(e);
    } finally {
      setBusy(false);
    }
  };

  if (licenca.emitida_em_sistema_anterior) {
    return (
      <section className="cartao mb-10 p-5" aria-label="Registro de licença emitida fora do CADEX">
        <h2 className="font-display text-base font-bold text-tinta-900">Registro de licença já emitida</h2>
        <p className="mt-2 text-sm text-tinta-700">
          Licença emitida no sistema anterior. Aqui ela é só o registro dos dados: não há PDF, prévia nem QR Code.
        </p>
        {podeLicenciar && (
          <div className="mt-3">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void marcar(false)}>
              Desmarcar (emitir pelo CADEX)
            </Button>
          </div>
        )}
        <div className="mt-2"><ErrorNote error={erro} /></div>
      </section>
    );
  }

  if (!podeLicenciar) return null;

  return (
    <section className="cartao mb-10 p-5" aria-label="Marcar licença emitida fora do CADEX">
      <h2 className="font-display text-base font-bold text-tinta-900">Emitida fora do CADEX?</h2>
      {confirmando ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-tinta-800">
          <span>Ela passa a ser só registro: sem PDF, prévia nem QR Code. Confirmar?</span>
          <Button type="button" disabled={busy} onClick={() => void marcar(true)}>Confirmar</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmando(false)}>Cancelar</Button>
        </div>
      ) : (
        <div className="mt-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmando(true)}>
            Marcar como emitida no sistema anterior
          </Button>
        </div>
      )}
      <div className="mt-2"><ErrorNote error={erro} /></div>
    </section>
  );
}
