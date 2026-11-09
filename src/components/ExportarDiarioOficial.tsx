import { useMemo } from 'react';
import { BotoesExportar } from './BotoesExportar';
import { empresasAutorizadas, relatorioDiarioOficial } from '../lib/diarioOficial';
import type { Contexto } from '../lib/exportar';
import type { Empresa } from '../lib/empresas';

/** Relação de empresas autorizadas para publicação no Diário Oficial, em PDF, Markdown ou planilha. */
export function ExportarDiarioOficial({ empresas, contexto }: { empresas: Empresa[]; contexto: Contexto }) {
  const autorizadas = useMemo(() => empresasAutorizadas(empresas, contexto.hoje), [empresas, contexto.hoje]);
  const relatorio = useMemo(() => relatorioDiarioOficial(autorizadas, contexto), [autorizadas, contexto]);
  return (
    <div className="mb-4 space-y-3 rounded-sm border border-tinta-200 bg-tinta-50 p-4">
      <h3 className="text-sm font-semibold text-tinta-800">Relação para o Diário Oficial</h3>
      <p className="text-sm text-tinta-600">
        Empresas ativas e com situação que permite atuar em vias públicas.
        {' '}{autorizadas.length} {autorizadas.length === 1 ? 'empresa' : 'empresas'} nesta relação.
      </p>
      <BotoesExportar relatorio={relatorio} desabilitado={autorizadas.length === 0} />
    </div>
  );
}
