import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { useEffect, useMemo, useState } from 'react';
import { Empty, ErrorNote, Spinner, inputClass } from '../components/ui';
import { SituacaoBadge, dataBR } from '../components/Situacao';
import { formatCnpj, onlyDigits } from '../lib/cnpj';
import { SITUACAO_LABEL, TIPO_LABEL, consultaPublica, type LinhaPublica } from '../lib/empresas';

/**
 * Consulta pública do CADEX (art. 7º, § 2º): aberta, sem login. Mostra só
 * dados da pessoa jurídica e da inscrição — nenhum contato, pessoa,
 * veículo ou documento.
 */
export default function Consulta() {
  const [linhas, setLinhas] = useState<LinhaPublica[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');

  useEffect(() => { consultaPublica().then(setLinhas).catch(setError); }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = onlyDigits(busca);
    return (linhas ?? []).filter((l) =>
      (!situacao || l.situacao === situacao)
      && (!q || l.razao_social.toLowerCase().includes(q)
          || (l.nome_fantasia ?? '').toLowerCase().includes(q)
          || l.codigo_cadex.toLowerCase().includes(q)
          || (qDig.length >= 3 && l.cnpj.includes(qDig))));
  }, [linhas, busca, situacao]);

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho itens={MENU_PUBLICO} />
      <section className="bg-rodape text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <h1 className="text-2xl font-medium sm:text-3xl">Consulta pública do CADEX</h1>
          <p className="mt-1 text-sm text-slate-200">Empresas inscritas no Cadastro de Executores do Município de Niterói</p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6">
        <p className="text-sm text-slate-600">
          Relação das empresas inscritas no Cadastro de Executores (CADEX), nos termos do
          art. 7º, § 2º, da Resolução Conjunta SECONSER/SEOP nº 001/2026. Somente empresas
          <strong> APTAS</strong> (inclusive em saneamento) podem atuar nas vias públicas,
          no subsolo e no espaço aéreo do Município (art. 3º).
        </p>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input className={inputClass} placeholder="Buscar por nome, CNPJ ou código CADEX" value={busca}
                 onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
          <select className={inputClass} value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
            <option value="">Todas as situações</option>
            {Object.entries(SITUACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <ErrorNote error={error} />
        {!linhas && !error && <Spinner />}
        {linhas && filtradas.length === 0 && <Empty>Nenhuma empresa encontrada.</Empty>}

        {filtradas.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Empresa</th>
                  <th className="px-3 py-2">Código CADEX</th>
                  <th className="px-3 py-2">CNPJ</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2">Válida até</th>
                  <th className="px-3 py-2">Publicação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map((l) => (
                  <tr key={l.codigo_cadex}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{l.razao_social}</div>
                      {l.nome_fantasia && <div className="text-xs text-slate-500">{l.nome_fantasia}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{l.codigo_cadex}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{formatCnpj(l.cnpj)}</td>
                    <td className="px-3 py-2">
                      {TIPO_LABEL[l.tipo]}
                      {l.contratantes.length > 0 && (
                        <div className="text-xs text-slate-500">para {l.contratantes.join(', ')}</div>
                      )}
                    </td>
                    <td className="px-3 py-2"><SituacaoBadge s={l.situacao} /></td>
                    <td className="whitespace-nowrap px-3 py-2">{dataBR(l.validade_ate)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {l.portaria_numero
                        ? <>{l.portaria_numero}<br />publicada em {dataBR(l.portaria_data)}</>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <Rodape />
    </div>
  );
}
