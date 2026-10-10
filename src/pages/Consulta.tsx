import { AbasConsulta } from '../components/AbasConsulta';
import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { useEffect, useMemo, useState } from 'react';
import { Empty, ErrorNote, Kpi, Spinner, Titulo, inputClass } from '../components/ui';
import { BARRA, dataBR } from '../components/Situacao';
import { SITUACAO_LABEL, type SituacaoEfetiva } from '../lib/empresas';

/** Fundo suave e selo cheio por situação: a cor do cartão diz a situação de longe. */
const FUNDO_CARTAO: Record<SituacaoEfetiva, string> = {
  deferida: 'bg-alta/5', apta: 'bg-alta/5', em_saneamento: 'bg-alta/5',
  em_analise: 'bg-atencao/5', inapta: 'bg-baixa/5', vencida: 'bg-baixa/5',
};
const SELO_CARTAO: Record<SituacaoEfetiva, string> = {
  deferida: 'bg-alta', apta: 'bg-alta', em_saneamento: 'bg-alta',
  em_analise: 'bg-atencao', inapta: 'bg-baixa', vencida: 'bg-baixa',
};
import { formatCnpj, onlyDigits } from '../lib/cnpj';
import {
  FILTRO_SITUACAO, SETORES, SETOR_LABEL, atuaNoSetor, consultaPublica, descricaoEmpresa, situacoesDoFiltro, urlLogo,
  type LinhaPublica, type Setor,
} from '../lib/empresas';

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
  const [setor, setSetor] = useState('');

  useEffect(() => { consultaPublica().then(setLinhas).catch(setError); }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = onlyDigits(busca);
    return (linhas ?? []).filter((l) =>
      situacoesDoFiltro(situacao).includes(l.situacao)
      && (!setor || atuaNoSetor(l, setor as Setor))
      && (!q || l.razao_social.toLowerCase().includes(q)
          || (l.nome_fantasia ?? '').toLowerCase().includes(q)
          || l.codigo_cadex.toLowerCase().includes(q)
          || (qDig.length >= 3 && l.cnpj.includes(qDig))));
  }, [linhas, busca, situacao, setor]);

  const temLogo = filtradas.some((l) => l.logo_arquivo);

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho itens={MENU_PUBLICO} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <Titulo
          trilha="Consulta pública"
          titulo="Consultar empresa executora"
          descricao="Antes de uma obra ou serviço na via pública, no subsolo ou na rede aérea, confira se a empresa responsável está com a inscrição APTA."
        />

        {linhas && (
          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
            <Kpi rotulo="Cadastradas" valor={linhas.length} detalhe="empresas no cadastro" />
            <Kpi rotulo="Habilitadas" tom="alta"
                 valor={linhas.filter((l) => ['deferida', 'apta', 'em_saneamento'].includes(l.situacao)).length}
                 detalhe="podem atuar" />
            <Kpi rotulo="Em análise" tom="atencao"
                 valor={linhas.filter((l) => l.situacao === 'em_analise').length}
                 detalhe="aguardando decisão" />
            <Kpi rotulo="Impedidas" tom="baixa"
                 valor={linhas.filter((l) => l.situacao === 'inapta' || l.situacao === 'vencida').length}
                 detalhe="inaptas ou vencidas" />
          </div>
        )}

        <AbasConsulta />

        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_220px_220px]">
          <input className={`${inputClass} py-3! text-base!`}
                 placeholder="Nome da empresa, CNPJ ou código CADEX"
                 value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar empresa" />
          <select className={`${inputClass} py-3! text-base!`} value={situacao}
                  onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
            <option value="">Qualquer situação</option>
            {FILTRO_SITUACAO.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
          <select className={`${inputClass} py-3! text-base!`} value={setor}
                  onChange={(e) => setSetor(e.target.value)} aria-label="Setor">
            <option value="">Todos os setores</option>
            {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
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
                    className={`grid gap-x-6 gap-y-2 border-l-[6px] px-5 py-4 lg:grid-cols-[170px_1fr_190px_220px] ${BARRA[l.situacao]} ${FUNDO_CARTAO[l.situacao]}`}>
                  <div>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold text-white ${SELO_CARTAO[l.situacao]}`}>
                      {SITUACAO_LABEL[l.situacao]}
                    </span>
                    <div className={`tabular mt-1.5 text-xs ${l.situacao === 'vencida' ? 'font-medium text-baixa' : 'text-tinta-500'}`}>
                      {l.validade_ate ? `Válida até ${dataBR(l.validade_ate)}` : 'Sem validade em curso'}
                    </div>
                  </div>

                  <div className="flex min-w-0 gap-3">
                    {temLogo && (l.logo_arquivo
                      ? <img src={urlLogo(l.logo_arquivo)} alt="" loading="lazy"
                             className="h-10 w-10 flex-none rounded-sm border border-tinta-200 bg-white object-contain p-0.5" />
                      : <span className="h-10 w-10 flex-none" aria-hidden />)}
                    <div className="min-w-0">
                      <div className="font-semibold text-tinta-900">{l.razao_social}</div>
                      {l.nome_fantasia && <div className="text-sm text-tinta-600">{l.nome_fantasia}</div>}
                      <div className="mt-0.5 text-sm text-tinta-500">
                        {descricaoEmpresa(l)}
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
