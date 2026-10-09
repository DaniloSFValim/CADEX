import { useState } from 'react';
import { BotoesExportar, SeletorAgrupamento } from './BotoesExportar';
import {
  AGRUPAR_EMPRESAS, COLUNAS, COLUNAS_PADRAO, COLUNAS_SECONSERVA, relacaoEmpresas, type AgrupamentoEmpresas, type Contexto,
} from '../lib/exportar';
import {
  SITUACAO_LABEL, TIPO_LABEL, situacaoEfetiva, situacoesDoFiltro, type Empresa, type SituacaoEfetiva, type Tipo,
} from '../lib/empresas';

const TIPOS = Object.keys(TIPO_LABEL) as Tipo[];
const SITUACOES = Object.keys(SITUACAO_LABEL) as SituacaoEfetiva[];

function alternar<T>(lista: T[], item: T, marcado: boolean): T[] {
  return marcado ? [...lista, item] : lista.filter((x) => x !== item);
}

function Opcao({ rotulo, marcado, onChange }: { rotulo: string; marcado: boolean; onChange: (m: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-tinta-700">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      {rotulo}
    </label>
  );
}

/** Relação de empresas em PDF ou planilha, com filtros, colunas e agrupamento à escolha. */
export function ExportarRelacao({
  empresas, contexto, podeVerDocumentos, tipoInicial, situacaoInicial, onFechar,
}: {
  empresas: Empresa[];
  contexto: Contexto;
  podeVerDocumentos: boolean;
  tipoInicial: string;
  situacaoInicial: string;
  onFechar: () => void;
}) {
  const [tipos, setTipos] = useState<Tipo[]>(tipoInicial ? [tipoInicial as Tipo] : TIPOS);
  const [situacoes, setSituacoes] = useState<SituacaoEfetiva[]>(
    situacoesDoFiltro(situacaoInicial));
  const [colunas, setColunas] = useState<string[]>(COLUNAS_PADRAO);
  const [agrupar, setAgrupar] = useState<AgrupamentoEmpresas>('');

  const disponiveis = COLUNAS.filter((c) => podeVerDocumentos || !c.soGestor);
  const grupos = [...new Set(disponiveis.map((c) => c.grupo))];
  const selecionadas = empresas.filter((e) =>
    tipos.includes(e.tipo) && situacoes.includes(situacaoEfetiva(e, contexto.hoje)));

  return (
    <div className="mb-4 space-y-4 rounded-sm border border-tinta-200 bg-tinta-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-tinta-800">Exportar relação de empresas</h3>
        <button type="button" className="text-sm text-tinta-500 hover:text-tinta-800" onClick={onFechar}>Fechar</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <fieldset>
          <legend className="text-sm font-semibold text-tinta-700">Tipos</legend>
          <div className="mt-1 space-y-1">
            {TIPOS.map((t) => (
              <Opcao key={t} rotulo={TIPO_LABEL[t]} marcado={tipos.includes(t)}
                     onChange={(m) => setTipos((l) => alternar(l, t, m))} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold text-tinta-700">Situações</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {SITUACOES.map((s) => (
              <Opcao key={s} rotulo={SITUACAO_LABEL[s]} marcado={situacoes.includes(s)}
                     onChange={(m) => setSituacoes((l) => alternar(l, s, m))} />
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-tinta-700">
          Dados a exportar
          <button type="button" className="ml-3 normal-case tracking-normal text-marca-700 hover:underline"
                  onClick={() => setColunas(disponiveis.map((c) => c.chave))}>todos</button>
          <button type="button" className="ml-2 normal-case tracking-normal text-marca-700 hover:underline"
                  onClick={() => setColunas(COLUNAS_PADRAO)}>padrão</button>
          <button type="button" className="ml-2 normal-case tracking-normal text-marca-700 hover:underline"
                  onClick={() => setColunas(COLUNAS_SECONSERVA)}>relação oficial (SECONSERVA)</button>
        </legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-3">
          {grupos.map((g) => (
            <div key={g}>
              <div className="text-xs font-medium text-tinta-600">{g}</div>
              {disponiveis.filter((c) => c.grupo === g).map((c) => (
                <Opcao key={c.chave} rotulo={c.rotulo} marcado={colunas.includes(c.chave)}
                       onChange={(m) => setColunas((l) => alternar(l, c.chave, m))} />
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      <SeletorAgrupamento valor={agrupar} opcoes={AGRUPAR_EMPRESAS} onChange={setAgrupar} />

      <BotoesExportar relatorio={relacaoEmpresas(selecionadas, colunas, contexto, agrupar, [
        `Tipos: ${tipos.length === TIPOS.length ? 'todos' : tipos.map((t) => TIPO_LABEL[t].toLowerCase()).join(', ')}.`,
        `Situações: ${situacoes.length === SITUACOES.length ? 'todas' : situacoes.map((x) => SITUACAO_LABEL[x].toLowerCase()).join(', ')}.`,
      ])} />
    </div>
  );
}
