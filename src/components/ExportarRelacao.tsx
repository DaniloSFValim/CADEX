import { useState } from 'react';
import { Button } from './ui';
import { COLUNAS, COLUNAS_PADRAO, baixarArquivo, relacaoCsv, type Contexto } from '../lib/exportar';
import {
  SITUACAO_LABEL, TIPO_LABEL, situacaoEfetiva, type Empresa, type SituacaoEfetiva, type Tipo,
} from '../lib/empresas';

const TIPOS = Object.keys(TIPO_LABEL) as Tipo[];
const SITUACOES = Object.keys(SITUACAO_LABEL) as SituacaoEfetiva[];

function alternar<T>(lista: T[], item: T, marcado: boolean): T[] {
  return marcado ? [...lista, item] : lista.filter((x) => x !== item);
}

function Opcao({ rotulo, marcado, onChange }: { rotulo: string; marcado: boolean; onChange: (m: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      {rotulo}
    </label>
  );
}

/** Relação de empresas em planilha (.csv que abre no Excel), com filtros e colunas à escolha. */
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
    situacaoInicial ? [situacaoInicial as SituacaoEfetiva] : SITUACOES);
  const [colunas, setColunas] = useState<string[]>(COLUNAS_PADRAO);

  const disponiveis = COLUNAS.filter((c) => podeVerDocumentos || !c.soGestor);
  const grupos = [...new Set(disponiveis.map((c) => c.grupo))];
  const selecionadas = empresas.filter((e) =>
    tipos.includes(e.tipo) && situacoes.includes(situacaoEfetiva(e, contexto.hoje)));

  return (
    <div className="mb-4 space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Exportar relação de empresas</h3>
        <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onFechar}>Fechar</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipos</legend>
          <div className="mt-1 space-y-1">
            {TIPOS.map((t) => (
              <Opcao key={t} rotulo={TIPO_LABEL[t]} marcado={tipos.includes(t)}
                     onChange={(m) => setTipos((l) => alternar(l, t, m))} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">Situações</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {SITUACOES.map((s) => (
              <Opcao key={s} rotulo={SITUACAO_LABEL[s]} marcado={situacoes.includes(s)}
                     onChange={(m) => setSituacoes((l) => alternar(l, s, m))} />
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Dados a exportar
          <button type="button" className="ml-3 normal-case tracking-normal text-marca-700 hover:underline"
                  onClick={() => setColunas(disponiveis.map((c) => c.chave))}>todos</button>
          <button type="button" className="ml-2 normal-case tracking-normal text-marca-700 hover:underline"
                  onClick={() => setColunas(COLUNAS_PADRAO)}>padrão</button>
        </legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-3">
          {grupos.map((g) => (
            <div key={g}>
              <div className="text-xs font-medium text-slate-600">{g}</div>
              {disponiveis.filter((c) => c.grupo === g).map((c) => (
                <Opcao key={c.chave} rotulo={c.rotulo} marcado={colunas.includes(c.chave)}
                       onChange={(m) => setColunas((l) => alternar(l, c.chave, m))} />
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={selecionadas.length === 0 || colunas.length === 0}
                onClick={() => baixarArquivo(
                  `cadex-empresas-${contexto.hoje}.csv`,
                  relacaoCsv(selecionadas, colunas, contexto),
                )}>
          Baixar planilha (Excel)
        </Button>
        <span className="text-sm text-slate-600">
          {selecionadas.length} empresa{selecionadas.length === 1 ? '' : 's'} · {colunas.length} coluna{colunas.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
