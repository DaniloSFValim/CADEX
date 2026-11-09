import { useMemo } from 'react';
import { BotoesExportar } from './BotoesExportar';
import { Button } from './ui';
import { empresasAutorizadas, relatorioDiarioOficial } from '../lib/diarioOficial';
import type { Contexto } from '../lib/exportar';
import type { Empresa } from '../lib/empresas';

/**
 * Relação das empresas marcadas pelo gestor para publicação no Diário Oficial, em PDF ou planilha, só com dados que podem ser publicados (LGPD). Depois de publicadas, a data da portaria é gravada no cadastro de cada empresa,
 * e ela passa a APTA, com validade de 12 meses a partir da publicação.
 */
export function ExportarDiarioOficial({ empresas, contexto, onLimpar }: {
  empresas: Empresa[]; contexto: Contexto; onLimpar: () => void;
}) {
  const autorizadas = useMemo(() => empresasAutorizadas(empresas, contexto.hoje), [empresas, contexto.hoje]);
  const relatorio = useMemo(() => relatorioDiarioOficial(autorizadas, contexto), [autorizadas, contexto]);
  return (
    <section aria-label="Relação para o Diário Oficial" className="mb-4 space-y-3 rounded-sm border border-tinta-200 bg-tinta-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-tinta-800">Relação para o Diário Oficial</h3>
        <Button variant="secondary" className="px-3! py-1.5!" onClick={onLimpar}>Limpar marcação</Button>
      </div>
      <p className="text-sm text-tinta-600">
        {autorizadas.length} {autorizadas.length === 1 ? 'empresa marcada' : 'empresas marcadas'} para publicação.
        Depois de publicadas, informe a data da portaria no cadastro de cada uma: ela passa a ser APTA.
      </p>
      <BotoesExportar relatorio={relatorio} desabilitado={autorizadas.length === 0} semMarkdown />
    </section>
  );
}
