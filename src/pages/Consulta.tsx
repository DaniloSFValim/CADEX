import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { useEffect, useMemo, useState } from 'react';
import { Empty, ErrorNote, Spinner, Titulo, inputClass, tabela } from '../components/ui';
import { SituacaoBadge, dataBR } from '../components/Situacao';
import { formatCnpj, onlyDigits } from '../lib/cnpj';
import { SITUACAO_LABEL, TIPO_LABEL, consultaPublica, podeAtuar, urlLogo, type LinhaPublica } from '../lib/empresas';

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

  const temLogo = filtradas.some((l) => l.logo_arquivo);
  const aptas = (linhas ?? []).filter((l) => podeAtuar(l.situacao)).length;

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho itens={MENU_PUBLICO} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Titulo
          trilha="Início / Consulta pública"
          titulo="Consulta pública de empresas inscritas"
          descricao={<>
            Só podem executar obras e serviços nas vias públicas de Niterói as empresas com
            inscrição APTA, conforme a Resolução Conjunta SECONSER/SEOP nº 001/2026.
          </>}
        />

        {linhas && (
          <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded border border-tinta-200 bg-tinta-200 sm:max-w-md">
            <div className="bg-white px-4 py-3">
              <dt className="text-2xs font-semibold uppercase tracking-wider text-tinta-500">Empresas inscritas</dt>
              <dd className="tabular mt-0.5 text-xl font-semibold text-tinta-900">{linhas.length}</dd>
            </div>
            <div className="bg-white px-4 py-3">
              <dt className="text-2xs font-semibold uppercase tracking-wider text-tinta-500">Aptas a atuar</dt>
              <dd className="tabular mt-0.5 text-xl font-semibold text-emerald-700">{aptas}</dd>
            </div>
          </dl>
        )}

        <section className="rounded border border-tinta-200 bg-white">
          <div className="grid gap-3 border-b border-tinta-200 p-4 sm:grid-cols-[1fr_220px]">
            <input className={inputClass} placeholder="Buscar por razão social, nome fantasia, CNPJ ou código CADEX"
                   value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
            <select className={inputClass} value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
              <option value="">Todas as situações</option>
              {Object.entries(SITUACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <ErrorNote error={error} />
          {!linhas && !error && <Spinner />}
          {linhas && filtradas.length === 0 && (
            <Empty>{linhas.length === 0 ? 'Nenhuma empresa inscrita até o momento.' : 'Nenhuma empresa encontrada para a busca.'}</Empty>
          )}

          {filtradas.length > 0 && (
            <ul className="divide-y divide-tinta-100 md:hidden">
              {filtradas.map((l) => (
                <li key={l.codigo_cadex} className="flex gap-3 px-4 py-3">
                  {temLogo && <Logo l={l} />}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-tinta-900">{l.razao_social}</div>
                      <SituacaoBadge s={l.situacao} />
                    </div>
                    <div className="tabular text-xs text-tinta-600">{l.codigo_cadex} · CNPJ {formatCnpj(l.cnpj)}</div>
                    <div className="text-xs text-tinta-500">
                      {TIPO_LABEL[l.tipo]}{l.contratantes.length > 0 && ` para ${l.contratantes.join(', ')}`}
                      {l.validade_ate && ` · válida até ${dataBR(l.validade_ate)}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {filtradas.length > 0 && (
            <div className={`${tabela.moldura} hidden md:block`}>
              <table className={tabela.tabela}>
                <thead className={tabela.cabeca}>
                  <tr>
                    <th className={tabela.th}>Empresa</th>
                    <th className={tabela.th}>Código CADEX</th>
                    <th className={tabela.th}>CNPJ</th>
                    <th className={tabela.th}>Tipo</th>
                    <th className={tabela.th}>Situação</th>
                    <th className={tabela.th}>Validade</th>
                    <th className={tabela.th}>Portaria</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((l) => (
                    <tr key={l.codigo_cadex} className={tabela.linha}>
                      <td className={tabela.td}>
                        <div className="flex items-center gap-3">
                          {temLogo && <Logo l={l} />}
                          <div>
                            <div className="font-medium text-tinta-900">{l.razao_social}</div>
                            {l.nome_fantasia && <div className="text-xs text-tinta-500">{l.nome_fantasia}</div>}
                          </div>
                        </div>
                      </td>
                      <td className={`${tabela.td} tabular whitespace-nowrap text-xs text-tinta-700`}>{l.codigo_cadex}</td>
                      <td className={`${tabela.td} tabular whitespace-nowrap text-xs text-tinta-700`}>{formatCnpj(l.cnpj)}</td>
                      <td className={tabela.td}>
                        {TIPO_LABEL[l.tipo]}
                        {l.contratantes.length > 0 && (
                          <div className="text-xs text-tinta-500">para {l.contratantes.join(', ')}</div>
                        )}
                      </td>
                      <td className={tabela.td}><SituacaoBadge s={l.situacao} /></td>
                      <td className={`${tabela.td} tabular whitespace-nowrap ${l.situacao === 'vencida' ? 'font-medium text-red-700' : ''}`}>{dataBR(l.validade_ate)}</td>
                      <td className={`${tabela.td} min-w-[200px] text-xs text-tinta-600`}>
                        {l.portaria_numero
                          ? <>{l.portaria_numero}<div className="text-tinta-400">publicada em {dataBR(l.portaria_data)}</div></>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {linhas && linhas.length > 0 && (
            <div className="border-t border-tinta-200 px-4 py-2.5 text-xs text-tinta-500">
              {filtradas.length} de {linhas.length} empresa{linhas.length === 1 ? '' : 's'}
            </div>
          )}
        </section>
      </main>
      <Rodape />
    </div>
  );
}

function Logo({ l }: { l: LinhaPublica }) {
  return l.logo_arquivo
    ? <img src={urlLogo(l.logo_arquivo)} alt="" loading="lazy"
           className="h-9 w-9 flex-none rounded border border-tinta-200 bg-white object-contain p-0.5" />
    : <span className="h-9 w-9 flex-none" aria-hidden />;
}
