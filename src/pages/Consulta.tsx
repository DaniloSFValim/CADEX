import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { useEffect, useMemo, useState } from 'react';
import { Empty, ErrorNote, Spinner, inputClass } from '../components/ui';
import { BARRA, SituacaoBadge, dataBR } from '../components/Situacao';
import { formatCnpj, onlyDigits } from '../lib/cnpj';
import { FILTRO_SITUACAO, consultaPublica, situacoesDoFiltro, urlLogo, type LinhaPublica } from '../lib/empresas';

/**
 * Consulta pública do CADEX (art. 7º, § 2º): aberta, sem login. Mostra só
 * dados da pessoa jurídica e da inscrição — nenhum contato, pessoa,
 * veículo ou documento.
 *
 * A pergunta da página é "esta empresa pode atuar?": cada registro abre
 * pela situação, marcada com um filete na cor dela.
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
      situacoesDoFiltro(situacao).includes(l.situacao)
      && (!q || l.razao_social.toLowerCase().includes(q)
          || (l.nome_fantasia ?? '').toLowerCase().includes(q)
          || l.codigo_cadex.toLowerCase().includes(q)
          || (qDig.length >= 3 && l.cnpj.includes(qDig))));
  }, [linhas, busca, situacao]);

  const temLogo = filtradas.some((l) => l.logo_arquivo);

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho itens={MENU_PUBLICO} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
        <header className="max-w-4xl pt-2">
          <p className="text-sm text-tinta-400">
            Consulta pública, Resolução Conjunta SECONSER/SEOP nº&nbsp;001/2026
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-tinta-900 sm:text-4xl md:text-[3rem]">
            Consultar empresa executora
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-tinta-500">
            Antes de uma obra ou serviço na via pública, no subsolo ou na rede aérea, confira se a
            empresa responsável está com a inscrição APTA.
          </p>
        </header>

        <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_240px]">
          <input className={`${inputClass} !py-3 !text-base`}
                 placeholder="Nome da empresa, CNPJ ou código CADEX"
                 value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar empresa" />
          <select className={`${inputClass} !py-3 !text-base`} value={situacao}
                  onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
            <option value="">Qualquer situação</option>
            {FILTRO_SITUACAO.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
        </div>

        <section className="mt-8" aria-live="polite">
          <ErrorNote error={error} />
          {!linhas && !error && <Spinner />}
          {linhas && (
            <p className="mb-3 text-sm text-tinta-500">
              {filtradas.length === linhas.length
                ? `${linhas.length} empresa${linhas.length === 1 ? '' : 's'} no cadastro`
                : `${filtradas.length} de ${linhas.length} empresas`}
            </p>
          )}
          {linhas && filtradas.length === 0 && (
            <div className="cartao">
              <Empty>
                {linhas.length === 0
                  ? 'Nenhuma empresa inscrita até o momento.'
                  : 'Nenhuma empresa corresponde à busca. Confira o CNPJ ou o código CADEX.'}
              </Empty>
            </div>
          )}

          {filtradas.length > 0 && (
            <ul className="cartao divide-y divide-tinta-100 overflow-hidden">
              {filtradas.map((l) => (
                <li key={l.codigo_cadex}
                    className={`grid gap-x-6 gap-y-2 border-l-4 px-5 py-4 md:grid-cols-[170px_1fr_190px_220px] ${BARRA[l.situacao]}`}>
                  <div>
                    <SituacaoBadge s={l.situacao} />
                    <div className={`tabular mt-1.5 text-xs ${l.situacao === 'vencida' ? 'font-medium text-baixa' : 'text-tinta-500'}`}>
                      {l.validade_ate ? `Válida até ${dataBR(l.validade_ate)}` : 'Sem validade em curso'}
                    </div>
                  </div>

                  <div className="flex min-w-0 gap-3">
                    {temLogo && (l.logo_arquivo
                      ? <img src={urlLogo(l.logo_arquivo)} alt="" loading="lazy"
                             className="h-10 w-10 flex-none rounded border border-tinta-200 bg-white object-contain p-0.5" />
                      : <span className="h-10 w-10 flex-none" aria-hidden />)}
                    <div className="min-w-0">
                      <div className="font-semibold text-tinta-900">{l.razao_social}</div>
                      {l.nome_fantasia && <div className="text-sm text-tinta-600">{l.nome_fantasia}</div>}
                      <div className="mt-0.5 text-sm text-tinta-500">
                        {l.tipo === 'operadora' ? 'Operadora de telecomunicações' : 'Terceirizada'}
                        {l.contratantes.length > 0 && `, contratada por ${l.contratantes.join(', ')}`}
                      </div>
                    </div>
                  </div>

                  <dl className="tabular text-sm">
                    <dt className="sr-only">Código CADEX</dt>
                    <dd className="font-semibold text-tinta-800">{l.codigo_cadex}</dd>
                    <dt className="sr-only">CNPJ</dt>
                    <dd className="text-tinta-600">{formatCnpj(l.cnpj)}</dd>
                  </dl>

                  <div className="text-sm text-tinta-600">
                    {l.portaria_numero
                      ? <>{l.portaria_numero}<div className="text-xs text-tinta-500">publicada em {dataBR(l.portaria_data)}</div></>
                      : <span className="text-tinta-400">Sem portaria publicada</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Rodape />
    </div>
  );
}
