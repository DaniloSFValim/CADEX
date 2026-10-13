import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AbasPainel } from '../components/AbasPainel';
import { BarrasHorizontais, ColunasMensais, LinhaDoTempo } from '../components/graficos';
import { dataBR } from '../components/Situacao';
import { Button, Empty, ErrorNote, Spinner, Titulo, inputClass } from '../components/ui';
import { hojeISO, listarEmpresas, somaDias, type Empresa } from '../lib/empresas';
import {
  ESTADO_LICENCA_LABEL, ORIGENS, ORIGEM_LABEL, SITUACAO_LICENCA_LABEL, TIPOS_INTERVENCAO, TIPO_INTERVENCAO_LABEL, TIPO_OBRA_LABEL,
  estadoLicenca, listarLicencas, nomeExecutora,
  type LicencaComTrechos, type OrigemIntervencao, type SituacaoLicenca, type TipoIntervencao, type TipoObra,
} from '../lib/licencas';
import { listarOrgaos, type Orgao } from '../lib/orgaos';
import {
  SEM_FILTROS, aplicarFiltros, distribuicaoPorParte, evolucaoMensal, indicadores, linhaDoTempo, maisRecentes,
  partesDistintas, porSituacaoAdministrativa, proximas, temFiltro, type ContextoPartes, type Filtros, type FiltroStatus,
  type RefData,
} from '../lib/painel';
import { TabelaLicencas } from './Licencas';

interface Dados { licencas: LicencaComTrechos[]; empresas: Empresa[]; orgaos: Orgao[] }

const JANELAS = [7, 15, 30] as const;
const PASSO_REGISTROS = 25;

/** Visão geral do painel: o que está licenciado, em que ponto está e com quem, direto do banco. */
export default function Painel() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS);
  const [janela, setJanela] = useState<(typeof JANELAS)[number]>(15);
  const [refData, setRefData] = useState<RefData>('decisao');
  const [mostrar, setMostrar] = useState(PASSO_REGISTROS);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      const [licencas, empresas, orgaos] = await Promise.all([listarLicencas(), listarEmpresas(), listarOrgaos()]);
      setDados({ licencas, empresas, orgaos });
      setErro(null);
      setAtualizadoEm(new Date());
    } catch (e) {
      setErro(e);
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // Volta a carregar quando a aba reaparece, para refletir o que foi incluído, alterado
  // ou excluído em outra tela, no máximo uma vez a cada 30 segundos.
  useEffect(() => {
    let ultimo = Date.now();
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimo > 30_000) { ultimo = Date.now(); void carregar(); }
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => { document.removeEventListener('visibilitychange', aoVoltar); window.removeEventListener('focus', aoVoltar); };
  }, [carregar]);

  const hoje = hojeISO();
  const ctx = useMemo<ContextoPartes>(() => ({
    empresas: new Map((dados?.empresas ?? []).map((e) => [e.id, e])),
    orgaos: new Map((dados?.orgaos ?? []).map((o) => [o.id, o])),
  }), [dados]);
  const todas = dados?.licencas;
  const filtradas = useMemo(() => (todas ? aplicarFiltros(todas, filtros, hoje, ctx) : []), [todas, filtros, hoje, ctx]);
  const ind = useMemo(() => indicadores(filtradas, hoje, janela, ctx), [filtradas, hoje, janela, ctx]);
  const administrativa = useMemo(() => porSituacaoAdministrativa(filtradas), [filtradas]);
  const porContratante = useMemo(() => distribuicaoPorParte(filtradas, 'contratante', ctx), [filtradas, ctx]);
  const porExecutora = useMemo(() => distribuicaoPorParte(filtradas, 'executora', ctx), [filtradas, ctx]);
  const mensal = useMemo(() => evolucaoMensal(filtradas, refData), [filtradas, refData]);
  const janelaTempo = useMemo(() => ({ de: somaDias(hoje, -60), ate: somaDias(hoje, 120) }), [hoje]);
  const tempo = useMemo(() => linhaDoTempo(filtradas, hoje, janelaTempo), [filtradas, hoje, janelaTempo]);
  const iniciam = useMemo(() => proximas(filtradas, hoje, janela, 'inicio'), [filtradas, hoje, janela]);
  const terminam = useMemo(() => proximas(filtradas, hoje, janela, 'fim'), [filtradas, hoje, janela]);
  const recentes = useMemo(() => maisRecentes(filtradas, 6), [filtradas]);
  const contratantesLista = useMemo(() => (todas ? partesDistintas(todas, 'contratante', ctx) : []), [todas, ctx]);
  const executorasLista = useMemo(() => (todas ? partesDistintas(todas, 'executora', ctx) : []), [todas, ctx]);

  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => { setFiltros((f) => ({ ...f, [k]: v })); setMostrar(PASSO_REGISTROS); };
  const alternar = (k: 'contratante' | 'executora', chave: string) => set(k, filtros[k] === chave ? '' : chave);
  const alternarStatus = (s: FiltroStatus) => set('status', filtros.status === s ? '' : s);

  const Cabeca = (
    <>
      <Titulo
        titulo="Painel gerencial"
        descricao="Licenças de obra registradas no CADEX, lidas do banco a cada abertura. Os filtros valem para tudo o que está abaixo."
        acoes={<>
          {atualizadoEm && <span className="text-xs text-tinta-500" role="status">Atualizado às {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          <Button variant="secondary" disabled={atualizando} onClick={() => void carregar()}>{atualizando ? 'Atualizando…' : 'Atualizar'}</Button>
        </>}
      />
      <AbasPainel />
    </>
  );

  if (!dados && !erro) return <>{Cabeca}<Spinner /></>;
  if (!dados) {
    return (
      <>{Cabeca}
        <ErrorNote error={erro} />
        <Button className="mt-4" onClick={() => void carregar()}>Tentar de novo</Button>
      </>
    );
  }
  if (dados.licencas.length === 0) {
    return (
      <>{Cabeca}
        <div className="cartao"><Empty>Nenhuma licença registrada ainda. O painel passa a mostrar os números assim que houver licenças no CADEX.</Empty></div>
      </>
    );
  }

  const ano = hoje.slice(0, 4);
  const PRESETS = [
    { rotulo: 'Todo o período', de: '', ate: '' },
    { rotulo: 'Este ano', de: `${ano}-01-01`, ate: `${ano}-12-31` },
    { rotulo: 'Últimos 90 dias', de: somaDias(hoje, -90), ate: hoje },
    { rotulo: 'Próximos 90 dias', de: hoje, ate: somaDias(hoje, 90) },
  ];
  const porId = ctx.empresas as Map<string, Empresa>;
  const nomeExec = (l: LicencaComTrechos) => nomeExecutora(l, porId);

  const barrasAdmin = (['deferida', 'em_analise', 'cancelada', 'indeferida'] as SituacaoLicenca[])
    .filter((s) => administrativa[s] > 0)
    .map((s) => ({ chave: `situacao:${s}`, rotulo: s === 'indeferida' ? 'Indeferida (histórico)' : SITUACAO_LICENCA_LABEL[s], n: administrativa[s] }));

  return (
    <div className={atualizando ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      {Cabeca}
      {erro != null && <div className="mb-4"><ErrorNote error={erro} /></div>}

      {/* Filtros: uma linha acima de tudo o que escopam. */}
      <section className="cartao p-4" aria-label="Filtros">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período da obra ou serviço">
          <span className="mr-1 text-sm font-medium text-tinta-700">Período da obra ou serviço</span>
          {PRESETS.map((p) => {
            const ativo = filtros.de === p.de && filtros.ate === p.ate;
            return (
              <button key={p.rotulo} type="button" aria-pressed={ativo}
                      onClick={() => { set('de', p.de); set('ate', p.ate); }}
                      className={`min-h-9 rounded-full px-3 text-sm transition-colors ${ativo ? 'bg-tinta-900 text-white' : 'bg-tinta-100 text-tinta-700 hover:bg-tinta-200'}`}>
                {p.rotulo}
              </button>
            );
          })}
          <label className="ml-2 inline-flex items-center gap-1.5 text-sm text-tinta-600">De
            <input type="date" className={`${inputClass} w-auto! py-1.5!`} value={filtros.de} max={filtros.ate || undefined}
                   onChange={(e) => set('de', e.target.value)} />
          </label>
          <label className="inline-flex items-center gap-1.5 text-sm text-tinta-600">Até
            <input type="date" className={`${inputClass} w-auto! py-1.5!`} value={filtros.ate} min={filtros.de || undefined}
                   onChange={(e) => set('ate', e.target.value)} />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[13px] font-medium text-tinta-700">Situação
            <select className={`${inputClass} mt-1`} value={filtros.status} onChange={(e) => set('status', e.target.value as FiltroStatus)}>
              <option value="">Todas</option>
              <optgroup label="Andamento da obra">
                <option value="estado:aguardando_inicio">Aguardando início (programada)</option>
                <option value="estado:em_execucao">Em execução (em andamento)</option>
                <option value="estado:prazo_encerrado">Prazo encerrado (sem conclusão)</option>
                <option value="grupo:concluidas">Concluída (com ou sem As Built)</option>
                <option value="estado:concluida_sem_as_built">Concluída, sem As Built</option>
              </optgroup>
              <optgroup label="Situação administrativa">
                <option value="situacao:deferida">Deferida</option>
                <option value="situacao:em_analise">Em análise</option>
                <option value="situacao:cancelada">Cancelada</option>
                <option value="situacao:indeferida">Indeferida (histórico)</option>
              </optgroup>
            </select>
          </label>
          <label className="block text-[13px] font-medium text-tinta-700">Contratante
            <select className={`${inputClass} mt-1`} value={filtros.contratante} onChange={(e) => set('contratante', e.target.value)}>
              <option value="">Todas</option>
              {contratantesLista.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
            </select>
          </label>
          <label className="block text-[13px] font-medium text-tinta-700">Executora
            <select className={`${inputClass} mt-1`} value={filtros.executora} onChange={(e) => set('executora', e.target.value)}>
              <option value="">Todas</option>
              {executorasLista.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
            </select>
          </label>
          <label className="block text-[13px] font-medium text-tinta-700">Tipo de intervenção
            <select className={`${inputClass} mt-1`} value={filtros.intervencao} onChange={(e) => set('intervencao', e.target.value as TipoIntervencao | '')}>
              <option value="">Todos</option>
              {TIPOS_INTERVENCAO.map((t) => <option key={t} value={t}>{TIPO_INTERVENCAO_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="block text-[13px] font-medium text-tinta-700">Origem da intervenção
            <select className={`${inputClass} mt-1`} value={filtros.origem} onChange={(e) => set('origem', e.target.value as OrigemIntervencao | '')}>
              <option value="">Todas</option>
              {ORIGENS.map((o) => <option key={o} value={o}>{ORIGEM_LABEL[o]}</option>)}
            </select>
          </label>
          <label className="block text-[13px] font-medium text-tinta-700">Tipo de obra
            <select className={`${inputClass} mt-1`} value={filtros.tipo} onChange={(e) => set('tipo', e.target.value as TipoObra | '')}>
              <option value="">Todos</option>
              {(Object.keys(TIPO_OBRA_LABEL) as TipoObra[]).map((t) => <option key={t} value={t}>{TIPO_OBRA_LABEL[t]}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-tinta-600" role="status">
          <span>
            {temFiltro(filtros)
              ? <><strong className="text-tinta-900">{filtradas.length}</strong> de {dados.licencas.length} licenças com estes filtros</>
              : <><strong className="text-tinta-900">{dados.licencas.length}</strong> licenças, sem filtro</>}
          </span>
          {temFiltro(filtros) && <Button variant="secondary" className="px-3! py-1.5!" onClick={() => { setFiltros(SEM_FILTROS); setMostrar(PASSO_REGISTROS); }}>Limpar filtros</Button>}
        </div>
      </section>

      {filtradas.length === 0 ? (
        <div className="cartao mt-6">
          <Empty>Nenhuma licença com estes filtros.</Empty>
        </div>
      ) : (<>
        {/* Indicadores */}
        <section className="mt-6" aria-label="Indicadores">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Indicador rotulo="Licenças registradas" valor={ind.total} detalhe="no filtro atual" onClick={() => set('status', '')} ativo={filtros.status === ''} />
            <Indicador rotulo="Aguardando início" valor={ind.programadas} detalhe="programadas: início previsto por vir" cor="border-tinta-400"
                       onClick={() => alternarStatus('estado:aguardando_inicio')} ativo={filtros.status === 'estado:aguardando_inicio'} />
            <Indicador rotulo="Em execução" valor={ind.emAndamento} detalhe="em andamento: período previsto em curso" cor="border-marca-600"
                       onClick={() => alternarStatus('estado:em_execucao')} ativo={filtros.status === 'estado:em_execucao'} />
            <Indicador rotulo="Concluídas" valor={ind.concluidas} detalhe="conclusão registrada" cor="border-alta"
                       onClick={() => alternarStatus('grupo:concluidas')} ativo={filtros.status === 'grupo:concluidas'} />
            <Indicador rotulo="Prazo encerrado" valor={ind.prazoVencido} detalhe="fim previsto vencido, sem conclusão" cor="border-baixa"
                       onClick={() => alternarStatus('estado:prazo_encerrado')} ativo={filtros.status === 'estado:prazo_encerrado'} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador rotulo={`Começam em até ${janela} dias`} valor={ind.iniciamNaJanela} detalhe="início previsto, obra aberta" />
            <Indicador rotulo={`Terminam em até ${janela} dias`} valor={ind.terminamNaJanela} detalhe="fim previsto, obra aberta" />
            <Indicador rotulo="Contratantes" valor={ind.contratantes.total} detalhe={detalheParte(ind.contratantes)} />
            <Indicador rotulo="Executoras" valor={ind.executoras.total} detalhe={detalheParte(ind.executoras)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-tinta-600" role="group" aria-label="Janela dos próximos dias">
            Janela dos indicadores de prazo:
            {JANELAS.map((j) => (
              <button key={j} type="button" aria-pressed={janela === j} onClick={() => setJanela(j)}
                      className={`min-h-9 rounded-full px-3 transition-colors ${janela === j ? 'bg-tinta-900 text-white' : 'bg-tinta-100 text-tinta-700 hover:bg-tinta-200'}`}>
                {j} dias
              </button>
            ))}
          </div>
        </section>

        {/* Gráficos */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Bloco titulo="Situação administrativa" nota="A decisão registrada. Clique para filtrar.">
            <BarrasHorizontais itens={barrasAdmin} total={ind.total} selecionada={filtros.status}
                               onSelecionar={(c) => alternarStatus(c as FiltroStatus)} />
          </Bloco>
          <Bloco titulo="Licenças por mês"
                 acao={<select className={`${inputClass} w-auto! py-1.5!`} value={refData} onChange={(e) => setRefData(e.target.value as RefData)} aria-label="Data de referência">
                   <option value="decisao">Mês da decisão</option>
                   <option value="registro">Mês do registro no CADEX</option>
                 </select>}>
            {mensal.meses.length === 0
              ? <Empty>Nenhuma licença com esta data.</Empty>
              : <ColunasMensais meses={mensal.meses} />}
            {mensal.semData > 0 && <p className="mt-2 text-xs text-tinta-500">{mensal.semData} licença{mensal.semData === 1 ? '' : 's'} sem esta data, fora do gráfico.</p>}
          </Bloco>
          <Bloco titulo="Por contratante" nota="Clique para filtrar.">
            {porContratante.barras.length === 0 ? <Empty>Nenhuma contratante informada.</Empty> : (
              <BarrasHorizontais itens={porContratante.barras} total={ind.total} selecionada={filtros.contratante}
                                 onSelecionar={(c) => alternar('contratante', c)} />
            )}
            <RodapeBarras demais={porContratante.demais} semInformacao={porContratante.semInformacao} sem="sem contratante informada" />
          </Bloco>
          <Bloco titulo="Por executora" nota="Clique para filtrar.">
            {porExecutora.barras.length === 0 ? <Empty>Nenhuma executora informada.</Empty> : (
              <BarrasHorizontais itens={porExecutora.barras} total={ind.total} selecionada={filtros.executora}
                                 onSelecionar={(c) => alternar('executora', c)} />
            )}
            <RodapeBarras demais={porExecutora.demais} semInformacao={porExecutora.semInformacao} sem="sem executora informada" />
          </Bloco>
        </div>

        <div className="mt-6">
          <Bloco titulo="Obras e serviços no tempo"
                 nota={`De ${dataBR(janelaTempo.de)} a ${dataBR(janelaTempo.ate)}: do início ao fim previstos de cada licença. Clique para abrir.`}>
            {tempo.itens.length === 0
              ? <Empty>Nenhuma licença com período previsto nesta janela.</Empty>
              : <LinhaDoTempo itens={tempo.itens} janela={janelaTempo} hoje={hoje} />}
            {(tempo.omitidas > 0 || tempo.semPeriodo > 0) && (
              <p className="mt-2 text-xs text-tinta-500">
                {tempo.omitidas > 0 && `${tempo.omitidas} licença${tempo.omitidas === 1 ? '' : 's'} a mais nesta janela, fora do desenho (use os filtros). `}
                {tempo.semPeriodo > 0 && `${tempo.semPeriodo} sem início e fim previstos, fora da linha do tempo.`}
              </p>
            )}
          </Bloco>
        </div>

        {/* Listas */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Bloco titulo={`Começam em até ${janela} dias`}>
            <ListaLicencas itens={iniciam.slice(0, 6)} data={(l) => dataBR(l.inicio_previsto)} nomeExec={nomeExec} hoje={hoje} vazio="Nenhuma obra aberta com início previsto nesta janela." total={iniciam.length} />
          </Bloco>
          <Bloco titulo={`Terminam em até ${janela} dias`}>
            <ListaLicencas itens={terminam.slice(0, 6)} data={(l) => dataBR(l.fim_previsto)} nomeExec={nomeExec} hoje={hoje} vazio="Nenhuma obra aberta com fim previsto nesta janela." total={terminam.length} />
          </Bloco>
          <Bloco titulo="Registradas mais recentemente">
            <ListaLicencas itens={recentes} data={(l) => dataBR(l.criado_em.slice(0, 10))} nomeExec={nomeExec} hoje={hoje} vazio="Nenhuma licença." />
          </Bloco>
        </div>

        {/* Registros correspondentes */}
        <section className="mt-8" aria-label="Registros">
          <h2 className="mb-3 font-display text-xl font-bold tracking-[-0.01em] text-tinta-900">Registros ({filtradas.length})</h2>
          <div className="cartao">
            <TabelaLicencas licencas={filtradas.slice(0, mostrar)} porId={porId} hoje={hoje} />
          </div>
          {filtradas.length > mostrar && (
            <div className="mt-3 text-center">
              <Button variant="secondary" onClick={() => setMostrar((m) => m + PASSO_REGISTROS)}>
                Mostrar mais ({filtradas.length - mostrar} restantes)
              </Button>
            </div>
          )}
        </section>

        <details className="mt-8 text-sm text-tinta-600">
          <summary className="cursor-pointer font-medium text-tinta-700">Como os números são contados</summary>
          <ul className="mt-2 max-w-3xl list-disc space-y-1 pl-5">
            <li>O CADEX não registra a data efetiva de início da obra, só o período previsto e a conclusão. Por isso nada é dado como começado ou terminado só porque uma data passou.</li>
            <li><strong>Aguardando início</strong> (programada): deferida, sem conclusão registrada, com o início previsto ainda por vir. <strong>Em execução</strong> (em andamento): deferida, sem conclusão registrada, com o período previsto em curso. <strong>Prazo encerrado</strong>: deferida, sem conclusão registrada, com o fim previsto já passado.</li>
            <li><strong>Concluída</strong>: tem a conclusão registrada. <strong>Começam / terminam em até N dias</strong>: obras abertas com a data prevista entre hoje e hoje mais N dias.</li>
            <li>Cada licença tem uma contratante e uma executora, e é contada uma vez em cada. Quando a própria contratante executa, a mesma empresa aparece nas duas listas.</li>
            <li>O filtro de período mostra as licenças cujo período previsto cruza o intervalo; sem período, vale a data da decisão.</li>
          </ul>
        </details>
      </>)}
    </div>
  );
}

const detalheParte = (c: { empresas: number; orgaos: number; outras: number }) =>
  [c.empresas > 0 && `${c.empresas} cadastrada${c.empresas === 1 ? '' : 's'}`, c.orgaos > 0 && `${c.orgaos} órgão${c.orgaos === 1 ? '' : 's'} público${c.orgaos === 1 ? '' : 's'}`,
   c.outras > 0 && `${c.outras} sem cadastro`].filter(Boolean).join(', ') || 'nenhuma informada';

function Indicador({ rotulo, valor, detalhe, cor = 'border-tinta-900', onClick, ativo }: {
  rotulo: string; valor: number; detalhe?: string; cor?: string; onClick?: () => void; ativo?: boolean;
}) {
  const conteudo = (
    <>
      <span className="block text-sm font-medium text-tinta-600">{rotulo}</span>
      <span className="mt-1 block font-display text-4xl font-bold leading-none tracking-[-0.02em] text-tinta-900">{valor}</span>
      {detalhe && <span className="mt-1.5 block text-xs text-tinta-500">{detalhe}</span>}
    </>
  );
  const base = `block w-full rounded-lg border border-tinta-200 border-t-4 bg-white px-4 py-3 text-left ${cor}`;
  return onClick ? (
    <button type="button" aria-pressed={ativo} onClick={onClick}
            className={`${base} transition-colors hover:bg-tinta-50 ${ativo ? 'ring-2 ring-marca-500' : ''}`}>{conteudo}</button>
  ) : <div className={base}>{conteudo}</div>;
}

function Bloco({ titulo, nota, acao, children }: { titulo: string; nota?: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="cartao p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold tracking-[-0.01em] text-tinta-900">{titulo}</h2>
          {nota && <p className="mt-0.5 text-xs text-tinta-500">{nota}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  );
}

function RodapeBarras({ demais, semInformacao, sem }: { demais: number; semInformacao: number; sem: string }) {
  if (demais === 0 && semInformacao === 0) return null;
  return (
    <p className="mt-2 text-xs text-tinta-500">
      {demais > 0 && `Demais: ${demais} licença${demais === 1 ? '' : 's'}. `}
      {semInformacao > 0 && `${semInformacao} ${sem}.`}
    </p>
  );
}

function ListaLicencas({ itens, data, nomeExec, hoje, vazio, total }: {
  itens: LicencaComTrechos[]; data: (l: LicencaComTrechos) => string; nomeExec: (l: LicencaComTrechos) => string;
  hoje: string; vazio: string; total?: number;
}) {
  if (itens.length === 0) return <p className="text-sm text-tinta-500">{vazio}</p>;
  return (
    <>
      <ul className="divide-y divide-tinta-100">
        {itens.map((l) => (
          <li key={l.id} className="py-2">
            <Link to={`/obras/${l.id}`} className="block hover:underline">
              <span className="flex items-baseline justify-between gap-3">
                <span className="tabular truncate text-sm font-medium text-tinta-900">{l.numero ?? l.processo_sei}</span>
                <span className="tabular flex-none text-xs text-tinta-600">{data(l)}</span>
              </span>
              <span className="block truncate text-xs text-tinta-500">{nomeExec(l)}, {ESTADO_LICENCA_LABEL[estadoLicenca(l, hoje)].toLowerCase()}</span>
            </Link>
          </li>
        ))}
      </ul>
      {total != null && total > itens.length && <p className="mt-2 text-xs text-tinta-500">E mais {total - itens.length}. Veja nos registros abaixo.</p>}
    </>
  );
}
