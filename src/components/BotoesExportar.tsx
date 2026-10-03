import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { baixarCsv, baixarPdf, totalLinhas, type Relatorio } from '../lib/relatorio';
import { Button, ErrorNote } from './ui';

/** Baixar o relatório em PDF (para anexar ao SEI) ou em planilha. */
export function BotoesExportar({ relatorio, desabilitado }: { relatorio: Relatorio; desabilitado?: boolean }) {
  const { servidor, session } = useAuth();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const total = totalLinhas(relatorio);
  const emitidoPor = [servidor?.nome, session?.user.email && `(${session.user.email})`].filter(Boolean).join(' ') || 'servidor';
  const vazio = desabilitado || total === 0 || relatorio.colunas.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={vazio || gerando} onClick={async () => {
        setErro(null); setGerando(true);
        try { await baixarPdf(relatorio, emitidoPor); } catch (e) { setErro(e); } finally { setGerando(false); }
      }}>
        {gerando ? 'Gerando PDF…' : 'Baixar PDF'}
      </Button>
      <Button variant="secondary" disabled={vazio} onClick={() => baixarCsv(relatorio)}>Baixar planilha</Button>
      <span className="text-sm text-tinta-600">
        {total} registro{total === 1 ? '' : 's'}
        {relatorio.grupos.length > 1 && ` em ${relatorio.grupos.length} grupos`}, {relatorio.colunas.length} coluna{relatorio.colunas.length === 1 ? '' : 's'}
      </span>
      <ErrorNote error={erro} />
    </div>
  );
}

/** Lista de opções de agrupamento. */
export function SeletorAgrupamento<T extends string>({ valor, opcoes, onChange }: {
  valor: T; opcoes: readonly { valor: T; rotulo: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-tinta-700">
      Agrupar por
      <select className="rounded border border-tinta-300 bg-white px-2 py-1.5 text-sm font-normal text-tinta-900"
              value={valor} onChange={(e) => onChange(e.target.value as T)}>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    </label>
  );
}
