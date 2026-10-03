import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Badge, Card, Empty, ErrorNote, Kpi, Spinner, Titulo, inputClass, linkTexto, tabela } from '../components/ui';
import { BotoesExportar } from '../components/BotoesExportar';
import { SituacaoBadge } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj } from '../lib/cnpj';
import { SITUACAO_LABEL, hojeISO, listarEmpresas, nomeEmpresa, situacaoEfetiva, type Empresa } from '../lib/empresas';
import { agrupar, type Relatorio } from '../lib/relatorio';
import {
  FONTE_ANATEL, buscarNiteroiAnatel, cruzar, rotuloCompetencia, type AtuacaoAnatel, type MunicipioAnatel,
} from '../lib/anatel';

const ATUACAO_LABEL: Record<AtuacaoAnatel, string> = {
  OPERADORA: 'Operadora', PROVEDOR: 'Provedor', AMBOS: 'Operadora e provedor', INDEFINIDO: 'Não informado',
};

const FILTROS = [
  { valor: 'sem', rotulo: 'Sem inscrição no CADEX' },
  { valor: 'com', rotulo: 'Inscritos no CADEX' },
  { valor: '', rotulo: 'Todos' },
] as const;

const pct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Uso interno do gestor: provedores com acessos de banda larga fixa em
 * Niterói segundo a Anatel, comparados com o cadastro do CADEX.
 */
export default function CruzamentoAnatel() {
  const { servidor } = useAuth();
  const gestor = servidor?.papel === 'gestor';
  const [anatel, setAnatel] = useState<MunicipioAnatel | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filtro, setFiltro] = useState<string>('sem');
  const [minimo, setMinimo] = useState('1');

  useEffect(() => {
    if (!gestor) return;
    Promise.all([buscarNiteroiAnatel(), listarEmpresas()])
      .then(([a, e]) => { setAnatel(a); setEmpresas(e); })
      .catch(setError);
  }, [gestor]);

  const cruzamento = useMemo(() => (anatel && empresas ? cruzar(anatel, empresas) : null), [anatel, empresas]);

  if (!gestor) return <Navigate to="/" replace />;

  const hoje = hojeISO();
  const min = Number(minimo) || 0;
  const linhas = (cruzamento?.linhas ?? []).filter((l) =>
    l.provedor.acessos >= min && (filtro === 'sem' ? !l.empresa : filtro === 'com' ? !!l.empresa : true));
  const sem = cruzamento?.linhas.filter((l) => !l.empresa && !l.grupoInscrito) ?? [];
  const soGrupo = cruzamento?.linhas.filter((l) => l.grupoInscrito) ?? [];

  // Relatório da lista na tela, agrupado pela situação no CADEX.
  const relatorio: Relatorio | null = anatel && {
    titulo: 'Provedores em Niterói (Anatel) e inscrição no CADEX',
    arquivo: 'cadex-anatel-niteroi',
    filtros: [
      `Acessos de banda larga fixa declarados à Anatel em ${rotuloCompetencia(anatel.competencia)}, processados pelo NETRANK RJ.`,
      `Filtro: ${FILTROS.find((f) => f.valor === filtro)?.rotulo.toLowerCase()}; mínimo de ${min} acesso${min === 1 ? '' : 's'}. Agrupado pela situação no CADEX.`,
      'Comparação pela raiz do CNPJ. Ter acessos não prova obra em via pública.',
    ],
    colunas: ['Provedor', 'CNPJ', 'Acessos', 'Participação', 'Atuação na Anatel', 'CADEX'],
    grupos: [...agrupar(linhas, (l) => [l.empresa ? 'Inscritos no CADEX' : l.grupoInscrito ? 'CNPJ não inscrito, grupo inscrito' : 'Sem inscrição no CADEX'])
      .entries()].map(([titulo, ls]) => ({
        titulo,
        linhas: ls.map(({ provedor: p, empresa: e, grupoInscrito: g }) => [
          p.nome, formatCnpj(p.cnpj), p.acessos.toLocaleString('pt-BR'), `${pct(p.marketShare)}%`,
          ATUACAO_LABEL[p.tipoAtuacao ?? 'INDEFINIDO'],
          e ? `${e.codigo_cadex}, ${SITUACAO_LABEL[situacaoEfetiva(e, hoje)].toLowerCase()}` : g ? `grupo: ${g.codigo_cadex}` : '',
        ]),
      })),
  };
  const acessosSem = sem.reduce((s, l) => s + l.provedor.acessos, 0);
  const total = anatel?.concentracao.totalAcessos ?? 0;

  return (
    <>
      <Titulo
        trilha="Uso interno do gestor"
        titulo="Anatel × CADEX"
        descricao={<>
          Provedores com acessos de banda larga fixa em Niterói, segundo a Anatel, comparados com as inscrições
          no CADEX. Ter acessos não prova obra em via pública: o provedor pode usar rede alugada. Use a lista
          para verificar, não para autuar.
        </>}
      />

      <ErrorNote error={error} />
      {!cruzamento && !error && <Spinner label="Lendo os dados da Anatel…" />}

      {cruzamento && anatel && (
        <>
          <div className="mb-10 grid gap-6 sm:grid-cols-3">
            <Kpi rotulo="Provedores na Anatel" valor={anatel.concentracao.numeroProvedores}
                 detalhe={`Acessos declarados em ${rotuloCompetencia(anatel.competencia)}`} />
            <Kpi rotulo="Sem inscrição" valor={sem.length} tom={sem.length ? 'baixa' : undefined}
                 detalhe={<>
                   {pct(total ? (acessosSem / total) * 100 : 0)}% dos acessos de Niterói
                   {soGrupo.length > 0 && `; mais ${soGrupo.length} CNPJ${soGrupo.length > 1 ? 's' : ''} de grupo já inscrito`}
                 </>} />
            <Kpi rotulo={cruzamento.operadorasSemAcessos.length === 1 ? 'Operadora sem acessos' : 'Operadoras sem acessos'}
                 valor={cruzamento.operadorasSemAcessos.length}
                 detalhe="Inscritas no CADEX, sem acessos declarados em Niterói" />
          </div>

          {relatorio && <div className="mb-4"><BotoesExportar relatorio={relatorio} /></div>}

          <Card
            title="Provedores"
            semPadding
            action={
              <div className="flex flex-wrap items-center gap-3">
                <select className={`${inputClass} w-auto!`} value={filtro} aria-label="Inscrição"
                        onChange={(e) => setFiltro(e.target.value)}>
                  {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm text-tinta-600">
                  Mínimo de acessos
                  <input className={`${inputClass} tabular w-24!`} type="number" min={0} value={minimo}
                         onChange={(e) => setMinimo(e.target.value)} />
                </label>
              </div>
            }
          >
            {linhas.length === 0 ? (
              <Empty>Nenhum provedor com esse filtro.</Empty>
            ) : (
              <div className={tabela.moldura}>
                <table className={tabela.tabela}>
                  <thead className={tabela.cabeca}>
                    <tr>
                      <th className={tabela.th}>Provedor</th>
                      <th className={tabela.th}>CNPJ</th>
                      <th className={`${tabela.th} text-right`}>Acessos</th>
                      <th className={`${tabela.th} text-right`}>Participação</th>
                      <th className={tabela.th}>Atuação na Anatel</th>
                      <th className={tabela.th}>CADEX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map(({ provedor: p, empresa: e, grupoInscrito: g }) => (
                      <tr key={p.cnpj} className={tabela.linha}>
                        <td className={`${tabela.td} font-medium text-tinta-900`}>{p.nome}</td>
                        <td className={`${tabela.td} tabular whitespace-nowrap text-tinta-600`}>{formatCnpj(p.cnpj)}</td>
                        <td className={`${tabela.td} tabular text-right`}>{p.acessos.toLocaleString('pt-BR')}</td>
                        <td className={`${tabela.td} tabular text-right`}>{pct(p.marketShare)}%</td>
                        <td className={`${tabela.td} text-tinta-600`}>{ATUACAO_LABEL[p.tipoAtuacao ?? 'INDEFINIDO']}</td>
                        <td className={tabela.td}>
                          {e ? (
                            <span className="flex flex-wrap items-center gap-2">
                              <Link to={`/empresas/${e.id}`} className={linkTexto}>{e.codigo_cadex}</Link>
                              <SituacaoBadge s={situacaoEfetiva(e, hoje)} />
                            </span>
                          ) : g ? (
                            <span className="flex flex-col gap-1">
                              <span><Badge tom="alerta">CNPJ não inscrito</Badge></span>
                              <span className="text-xs text-tinta-500">
                                Grupo inscrito por <Link to={`/empresas/${g.id}`} className={linkTexto}>{g.codigo_cadex}</Link>
                              </span>
                            </span>
                          ) : <Badge tom="ruim">Sem inscrição</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="mt-10">
            <Card title="Operadoras inscritas sem acessos em Niterói">
              {cruzamento.operadorasSemAcessos.length === 0 ? (
                <Empty>Todas as operadoras inscritas têm acessos declarados em Niterói.</Empty>
              ) : (
                <>
                  <p className="mb-3 text-sm text-tinta-500">
                    Pode ser operadora só de infraestrutura (sem clientes de banda larga fixa), CNPJ de outra
                    empresa do grupo, ou dado a corrigir no cadastro.
                  </p>
                  <ul className="divide-y divide-tinta-100">
                    {cruzamento.operadorasSemAcessos.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <Link to={`/empresas/${e.id}`} className={linkTexto}>{nomeEmpresa(e)}</Link>
                        <span className="tabular text-sm text-tinta-500">{formatCnpj(e.cnpj)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>

          <p className="mt-8 text-sm text-tinta-500">
            Fonte: Anatel, dados abertos de acessos de banda larga fixa, {rotuloCompetencia(anatel.competencia)},
            processados pelo <a className={linkTexto} href={FONTE_ANATEL} target="_blank" rel="noopener noreferrer">NETRANK RJ</a>.
            Comparação pela raiz do CNPJ (8 primeiros dígitos): filiais contam como a mesma empresa. Grupo
            econômico conforme a Anatel; um CNPJ do grupo sem inscrição própria aparece em amarelo, porque a
            inscrição no CADEX é por CNPJ. Os acessos são os que as prestadoras declaram à Anatel.
          </p>
        </>
      )}
    </>
  );
}
