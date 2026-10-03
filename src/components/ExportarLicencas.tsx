import { useState } from 'react';
import { BotoesExportar, SeletorAgrupamento } from './BotoesExportar';
import {
  AGRUPAR_LICENCAS, COLUNAS_LICENCA, COLUNAS_LICENCA_PADRAO, relacaoLicencas,
  type AgrupamentoLicencas, type ContextoLicencas,
} from '../lib/relatorioLicencas';
import type { LicencaComTrechos } from '../lib/licencas';

/** Licenças da lista na tela (com os filtros aplicados) em PDF ou planilha. */
export function ExportarLicencas({ licencas, contexto, filtros, onFechar }: {
  licencas: LicencaComTrechos[]; contexto: ContextoLicencas; filtros: string[]; onFechar: () => void;
}) {
  const [colunas, setColunas] = useState<string[]>(COLUNAS_LICENCA_PADRAO);
  const [agrupar, setAgrupar] = useState<AgrupamentoLicencas>('');
  return (
    <div className="mb-4 space-y-4 rounded border border-tinta-200 bg-tinta-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-tinta-800">Exportar relação de licenças</h3>
        <button type="button" className="text-sm text-tinta-500 hover:text-tinta-800" onClick={onFechar}>Fechar</button>
      </div>
      <p className="text-sm text-tinta-600">
        Sai a lista que está na tela: use a busca e os filtros abaixo para escolher as licenças.
      </p>
      <fieldset>
        <legend className="text-sm font-semibold text-tinta-700">
          Dados a exportar
          <button type="button" className="ml-3 text-marca-700 hover:underline"
                  onClick={() => setColunas(COLUNAS_LICENCA.map((c) => c.chave))}>todos</button>
          <button type="button" className="ml-2 text-marca-700 hover:underline"
                  onClick={() => setColunas(COLUNAS_LICENCA_PADRAO)}>padrão</button>
        </legend>
        <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
          {COLUNAS_LICENCA.map((c) => (
            <label key={c.chave} className="flex items-center gap-2 text-sm text-tinta-700">
              <input type="checkbox" checked={colunas.includes(c.chave)}
                     onChange={(e) => setColunas((l) => (e.target.checked
                       ? COLUNAS_LICENCA.map((x) => x.chave).filter((k) => k === c.chave || l.includes(k))
                       : l.filter((k) => k !== c.chave)))} />
              {c.rotulo}
            </label>
          ))}
        </div>
      </fieldset>
      <SeletorAgrupamento valor={agrupar} opcoes={AGRUPAR_LICENCAS} onChange={setAgrupar} />
      <BotoesExportar relatorio={relacaoLicencas(licencas, colunas, contexto, agrupar, filtros)} />
    </div>
  );
}
