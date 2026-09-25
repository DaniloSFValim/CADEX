import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, ErrorNote, Spinner } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { formatCnpj, formatCpf } from '../lib/cnpj';
import {
  ESTADO_LABEL, SITUACAO_LABEL, TIPO_LABEL, TIPO_RESOLUCAO, buscarEmpresa, estadoDocumento, hojeISO,
  listarDaEmpresa, listarDocumentos, listarEmpresas, listarHistorico, listarTiposDocumento, listarVinculos,
  nomeEmpresa, situacaoEfetiva, ultimoPorTipo, urlLogo,
  type Documento, type Empresa, type Historico, type Registro, type TipoDocumento, type Vinculo,
} from '../lib/empresas';

type Secao = 'cadastro' | 'inscricao' | 'vinculos' | 'rt' | 'pessoal' | 'veiculos' | 'documentos';

const SECOES: { chave: Secao; rotulo: string; soGestor?: boolean }[] = [
  { chave: 'cadastro', rotulo: 'Dados cadastrais' },
  { chave: 'inscricao', rotulo: 'Inscrição e histórico' },
  { chave: 'vinculos', rotulo: 'Vínculos' },
  { chave: 'rt', rotulo: 'Responsáveis técnicos' },
  { chave: 'pessoal', rotulo: 'Pessoal técnico' },
  { chave: 'veiculos', rotulo: 'Veículos e maquinário' },
  { chave: 'documentos', rotulo: 'Situação dos documentos', soGestor: true },
];

interface Dados {
  empresa: Empresa;
  todas: Empresa[];
  vinculos: Vinculo[];
  historico: Historico[];
  rt: Registro[];
  pessoal: Registro[];
  veiculos: Registro[];
  tipos: TipoDocumento[];
  docs: Documento[];
}

/** Ficha da empresa pronta para imprimir ou salvar em PDF (pelo navegador). */
export default function Ficha() {
  const { id = '' } = useParams();
  const { podeEditar, servidor } = useAuth();
  const [d, setD] = useState<Dados | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [secoes, setSecoes] = useState<Secao[]>(SECOES.filter((s) => podeEditar || !s.soGestor).map((s) => s.chave));

  useEffect(() => {
    // O CISP não tem acesso a documentos: nem pede.
    Promise.all([
      buscarEmpresa(id), listarEmpresas(), listarVinculos(), listarHistorico(id),
      listarDaEmpresa('responsaveis_tecnicos', id), listarDaEmpresa('funcionarios', id),
      listarDaEmpresa('veiculos', id),
      podeEditar ? listarTiposDocumento() : Promise.resolve([]),
      podeEditar ? listarDocumentos(id) : Promise.resolve([]),
    ])
      .then(([empresa, todas, vinculos, historico, rt, pessoal, veiculos, tipos, docs]) => setD({
        empresa, todas, vinculos, historico,
        rt: rt.filter((r) => r.ativo), pessoal: pessoal.filter((r) => r.ativo),
        veiculos: veiculos.filter((r) => r.ativo), tipos, docs,
      }))
      .catch(setError);
  }, [id, podeEditar]);

  if (error) return <div className="p-6"><ErrorNote error={error} /></div>;
  if (!d) return <Spinner />;

  const { empresa: e } = d;
  const hoje = hojeISO();
  const porId = new Map(d.todas.map((x) => [x.id, x]));
  const ver = (s: Secao) => secoes.includes(s);
  const ativos = d.vinculos.filter((v) => !v.fim);
  const contratantes = ativos.filter((v) => v.contratada_id === e.id).map((v) => porId.get(v.contratante_id));
  const contratadas = ativos.filter((v) => v.contratante_id === e.id).map((v) => porId.get(v.contratada_id));
  const ultimos = ultimoPorTipo(d.docs);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <Link to={`/empresas/${e.id}`} className="text-marca-700 hover:underline">← Voltar</Link>
          <span className="font-medium text-slate-700">Incluir:</span>
          {SECOES.filter((s) => podeEditar || !s.soGestor).map((s) => (
            <label key={s.chave} className="flex items-center gap-1.5 text-slate-700">
              <input type="checkbox" checked={ver(s.chave)}
                     onChange={(ev) => setSecoes((l) => ev.target.checked ? [...l, s.chave] : l.filter((x) => x !== s.chave))} />
              {s.rotulo}
            </label>
          ))}
          <Button className="ml-auto" onClick={() => window.print()}>Imprimir / salvar PDF</Button>
        </div>
      </div>

      <article className="mx-auto my-6 max-w-4xl bg-white p-8 text-sm text-slate-800 shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-center justify-between gap-6 border-b-2 border-marca-600 pb-4">
          <img src="/logo-prefeitura-seconser.png" alt="Prefeitura de Niterói — SECONSER" className="h-16 w-auto" />
          <div className="text-right leading-tight">
            <div className="text-base font-bold tracking-wide">CADEX</div>
            <div className="text-xs text-slate-600">Cadastro de Executores</div>
            <div className="text-xs text-slate-600">Ficha da empresa</div>
          </div>
        </header>

        <div className="mt-5 flex items-start gap-5">
          {e.logo_arquivo && (
            <img src={urlLogo(e.logo_arquivo)} alt={`Logo de ${nomeEmpresa(e)}`}
                 className="h-20 w-20 flex-none rounded border border-slate-200 object-contain p-1" />
          )}
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{e.razao_social}</h1>
            {e.nome_fantasia && <div className="text-slate-600">{e.nome_fantasia}</div>}
            <div className="mt-1 font-mono font-semibold text-marca-800">{e.codigo_cadex}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Situação</div>
            <div className="text-base font-bold">{SITUACAO_LABEL[situacaoEfetiva(e, hoje)]}</div>
          </div>
        </div>

        {ver('cadastro') && (
          <Bloco titulo="Dados cadastrais">
            <Grade itens={[
              ['CNPJ', formatCnpj(e.cnpj)],
              ['Tipo', `${TIPO_LABEL[e.tipo]} (${TIPO_RESOLUCAO[e.tipo]})`],
              ['E-mail', e.email],
              ['Telefone', e.telefone],
              ['Endereço', [[e.logradouro, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro,
                [e.cidade, e.uf].filter(Boolean).join('/'), e.cep && `CEP ${e.cep}`].filter(Boolean).join(' – ')],
              ['Observações', e.observacoes],
            ]} />
          </Bloco>
        )}

        {ver('inscricao') && (
          <Bloco titulo="Inscrição no CADEX (arts. 7º e 8º)">
            <Grade itens={[
              ['Nº do processo', e.processo_numero],
              ['Data do requerimento', e.data_requerimento && dataBR(e.data_requerimento)],
              ['Portaria', e.portaria_numero],
              ['Publicada em', e.portaria_data && dataBR(e.portaria_data)],
              ['Válida até', e.validade_ate && dataBR(e.validade_ate)],
              ['Notificação para saneamento', e.notificacao_data && dataBR(e.notificacao_data)],
            ]} />
            {d.historico.length > 0 && (
              <Tabela cab={['Data', 'De', 'Para', 'Portaria']} linhas={d.historico.map((h) => [
                new Date(h.em).toLocaleDateString('pt-BR'),
                h.de ? SITUACAO_LABEL[h.de] : '—', SITUACAO_LABEL[h.para],
                h.portaria_numero ? `${h.portaria_numero}${h.portaria_data ? ` (${dataBR(h.portaria_data)})` : ''}` : '—',
              ])} />
            )}
          </Bloco>
        )}

        {ver('vinculos') && (
          <Bloco titulo="Vínculos de contratação ativos">
            <Grade itens={[
              ...(e.tipo === 'terceirizada' ? [['Contratada por', nomesEmpresas(contratantes)] as const] : []),
              [e.tipo === 'terceirizada' ? 'Subcontratadas' : 'Terceirizadas contratadas', nomesEmpresas(contratadas)],
            ]} />
          </Bloco>
        )}

        {ver('rt') && (
          <Bloco titulo="Responsáveis técnicos (art. 6º, II)">
            <Tabela vazio="Nenhum responsável técnico cadastrado." cab={['Nome', 'CPF', 'Registro', 'ART/RRT']}
                    linhas={d.rt.map((r) => [
                      txt(r.nome), formatCpf(txt(r.cpf)),
                      `${txt(r.conselho)} ${txt(r.registro_numero)}${r.registro_uf ? `/${r.registro_uf}` : ''}`,
                      txt(r.art_rrt_numero) || '—',
                    ])} />
          </Bloco>
        )}

        {ver('pessoal') && (
          <Bloco titulo="Pessoal técnico (arts. 23 e 25)">
            <Tabela vazio="Nenhum funcionário cadastrado." cab={['Nome', 'Função', 'Documento', 'Crachá válido até']}
                    linhas={d.pessoal.map((r) => [
                      `${txt(r.nome)}${r.responsavel_equipe ? ' (responsável de equipe)' : ''}`, txt(r.funcao),
                      `${txt(r.documento_tipo)} ${txt(r.documento_numero)}`,
                      r.cracha_validade ? dataBR(txt(r.cracha_validade)) : '—',
                    ])} />
          </Bloco>
        )}

        {ver('veiculos') && (
          <Bloco titulo="Veículos e maquinário (arts. 19 e 21)">
            <Tabela vazio="Nenhum veículo cadastrado." cab={['Placa', 'Tipo', 'Modelo', 'Identificação visual']}
                    linhas={d.veiculos.map((r) => {
                      const traseira = r.concessionaria_traseira_id ? porId.get(txt(r.concessionaria_traseira_id)) : undefined;
                      return [
                        txt(r.placa) || (r.categoria === 'maquinario' ? 'maquinário' : '—'), txt(r.tipo), txt(r.modelo) || '—',
                        `laterais ${r.identificacao_laterais ? 'sim' : 'não'}, traseira ${r.identificacao_traseira ? 'sim' : 'não'}`
                          + (traseira ? ` (${nomeEmpresa(traseira)})` : ''),
                      ];
                    })} />
          </Bloco>
        )}

        {ver('documentos') && podeEditar && (
          <Bloco titulo="Documentos do art. 6º — situação">
            <Tabela cab={['Documento', 'Fundamento', 'Situação', 'Validade']} linhas={d.tipos.map((t) => {
              const doc = ultimos.get(t.codigo);
              const est = estadoDocumento(t, doc, hoje);
              return [
                t.nome, t.fundamento,
                est === 'pendente' ? (t.obrigatorio ? 'Pendente' : 'Não enviado (quando aplicável)') : ESTADO_LABEL[est],
                doc?.validade ? dataBR(doc.validade) : '—',
              ];
            })} />
          </Bloco>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-500">
          Emitida em {new Date().toLocaleString('pt-BR')}{servidor && ` por ${servidor.nome}`} · CADEX — Fiscalização
          de Serviços Concedidos – SECONSER · Resolução Conjunta SECONSER/SEOP nº 001/2026.
          Documento para uso interno; a situação oficial é a publicada em portaria.
        </footer>
      </article>
    </div>
  );
}

const txt = (v: unknown) => (v == null ? '' : String(v));

const nomesEmpresas = (l: (Empresa | undefined)[]) =>
  l.filter((x): x is Empresa => Boolean(x)).map((x) => `${nomeEmpresa(x)} (${x.codigo_cadex})`).join('; ') || '—';

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wider text-marca-800">{titulo}</h2>
      {children}
    </section>
  );
}

function Grade({ itens }: { itens: readonly (readonly [string, string | null | undefined])[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">
      {itens.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-slate-500">{k}</dt>
          <dd>{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tabela({ cab, linhas, vazio }: { cab: string[]; linhas: string[][]; vazio?: string }) {
  if (linhas.length === 0) return <p className="text-slate-500">{vazio ?? '—'}</p>;
  return (
    <table className="mt-2 w-full text-left text-xs">
      <thead className="text-slate-500">
        <tr>{cab.map((c) => <th key={c} className="border-b border-slate-200 py-1 pr-3 font-medium">{c}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className="break-inside-avoid">
            {l.map((c, j) => <td key={j} className="border-b border-slate-100 py-1 pr-3 align-top">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
