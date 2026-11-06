import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, ErrorNote, Spinner, Titulo } from '../components/ui';
import { ExcluirLicenca } from '../components/ExclusaoLicenca';
import { dataBR } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { SETOR_LABEL, hojeISO, listarEmpresas, type Empresa } from '../lib/empresas';
import {
  ESTADO_LICENCA_LABEL, ORIGEM_LABEL, TIPO_INTERVENCAO_LABEL, TIPO_OBRA_LABEL, TOM_ESTADO_LICENCA, buscarLicenca, estadoLicenca,
  nomeExecutora, rotuloProrrogacao, type LicencaComTrechos,
} from '../lib/licencas';
import { CONDICOES_LICENCA } from '../lib/licencaPdf';
import { listarOrgaos, nomeOrgao, type Orgao } from '../lib/orgaos';

/**
 * Ficha da licença: visualização só de leitura, em formato de documento. Não tem campos
 * de formulário nem ações de edição; a edição fica em /obras/:id/editar, por ação explícita.
 * Imprimir e "salvar em PDF" usam a impressão do navegador, sobre a própria ficha.
 */
export default function LicencaFicha() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { podeLicenciar, servidor } = useAuth();
  const administrador = Boolean(servidor?.administrador);
  const [licenca, setLicenca] = useState<LicencaComTrechos | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setLicenca(null);
    Promise.all([buscarLicenca(id), listarEmpresas(), listarOrgaos()])
      .then(([l, e, o]) => { setLicenca(l); setEmpresas(e); setOrgaos(o); })
      .catch(setError);
  }, [id]);

  const porId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const orgaoPorId = useMemo(() => new Map(orgaos.map((o) => [o.id, o])), [orgaos]);

  if (error) return <ErrorNote error={error} />;
  if (!licenca) return <Spinner />;

  const hoje = hojeISO();
  const estado = estadoLicenca(licenca, hoje);
  const empresaNome = (eid: string | null) => {
    const e = eid ? porId.get(eid) : undefined;
    return e ? (e.nome_fantasia?.trim() || e.razao_social) : null;
  };
  const contratante = licenca.contratante_id
    ? empresaNome(licenca.contratante_id)
    : licenca.orgao_contratante_id && orgaoPorId.get(licenca.orgao_contratante_id)
      ? nomeOrgao(orgaoPorId.get(licenca.orgao_contratante_id)!)
      : licenca.contratante_razao_social ?? null;
  const executora = nomeExecutora(licenca, porId);
  const subcontratada = empresaNome(licenca.subcontratada_id);
  const tipos = licenca.tipos_obra.map((t) => TIPO_OBRA_LABEL[t] ?? t);
  const cancelada = licenca.situacao === 'cancelada';
  const naLixeira = Boolean(licenca.excluida_em);

  return (
    <>
      {/* Estilo de impressão: só a ficha sai no papel ou no PDF. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #ficha-impressa, #ficha-impressa * { visibility: visible; }
          #ficha-impressa { position: absolute; inset: 0; width: 100%; padding: 0; }
          .nao-imprime { display: none !important; }
        }
      `}</style>

      <div className="nao-imprime">
        <Titulo
          trilha={<><Link to="/obras" className="hover:underline">Obras</Link> / Ficha</>}
          titulo={licenca.numero ? `Licença ${licenca.numero}` : 'Licença sem número'}
          descricao={
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tom={TOM_ESTADO_LICENCA[estado]}>{ESTADO_LICENCA_LABEL[estado]}</Badge>
              <Badge>{SETOR_LABEL[licenca.setor]}</Badge>
              {naLixeira && <Badge tom="alerta">Na lixeira</Badge>}
            </span>
          }
          acoes={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/obras'))}>Voltar à consulta</Button>
              <Button variant="secondary" onClick={() => window.print()}>Imprimir ou salvar em PDF</Button>
              {podeLicenciar && !naLixeira && (
                <Button onClick={() => navigate(`/obras/${licenca.id}/editar`)}>Editar licença</Button>
              )}
              {administrador && !naLixeira && (
                <ExcluirLicenca licenca={licenca} empresas={porId} orgaos={orgaos} hoje={hoje}
                                onExcluida={(aviso) => navigate('/admin/licencas', { state: { aviso } })} />
              )}
            </div>
          }
        />
      </div>

      {naLixeira && (
        <p role="status" className="nao-imprime mb-6 rounded-sm border-l-4 border-baixa bg-baixa/6 px-3 py-2 text-sm text-tinta-800">
          Esta licença está na lixeira (excluída em {dataBR(licenca.excluida_em!.slice(0, 10))}
          {licenca.excluida_motivo && `: ${licenca.excluida_motivo}`}). Não aparece nas listas, no mapa nem na consulta pública.{' '}
          {administrador && <Link to="/admin/licencas" className="font-semibold underline">Ir para a lixeira</Link>}
        </p>
      )}
      {licenca.emitida_em_sistema_anterior && (
        <p className="nao-imprime mb-6 rounded-sm border-l-4 border-tinta-400 bg-tinta-50 px-3 py-2 text-sm text-tinta-800">
          Licença emitida no sistema anterior. Aqui ela é só o registro dos dados: não há PDF, prévia nem QR Code.
        </p>
      )}

      <article id="ficha-impressa" className="rounded-xl border border-tinta-200 bg-white p-8 text-sm text-tinta-900 shadow-xs print:border-0 print:shadow-none">
        <header className="border-b border-tinta-200 pb-4">
          <div className="text-center">
            <p className="text-sm font-bold text-tinta-900">PREFEITURA MUNICIPAL DE NITERÓI</p>
            <p className="text-xs text-tinta-600">SECRETARIA DE CONSERVAÇÃO E SERVIÇOS PÚBLICOS</p>
            <p className="text-xs font-semibold text-marca-700">FISCALIZAÇÃO DE SERVIÇOS CONCEDIDOS</p>
          </div>
          <h2 className="mt-4 text-xl font-bold text-tinta-900">Licença para execução de obras e serviços em vias públicas</h2>
          <p className="mt-1 text-tinta-600">Número {licenca.numero ?? 'não informado'} · Processo SEI {licenca.processo_sei}</p>
          {cancelada && <p className="mt-2 font-semibold text-baixa">Licença cancelada.</p>}
        </header>

        <Secao titulo="Identificação">
          <Campos>
            <Campo rotulo="Situação">{ESTADO_LICENCA_LABEL[estado]}</Campo>
            <Campo rotulo="Protocolo">{dataBR(licenca.protocolo_data)}</Campo>
            <Campo rotulo="Validade">
              {licenca.validade_ate ? dataBR(licenca.validade_ate) : 'Não se aplica'}
              {licenca.prorrogacoes > 0 && <span className="block text-xs font-normal text-tinta-600">Já prorrogada: {rotuloProrrogacao(licenca.prorrogacoes)}</span>}
            </Campo>
            <Campo rotulo="Setor">{SETOR_LABEL[licenca.setor]}</Campo>
            <Campo rotulo="Tipo de intervenção">{TIPO_INTERVENCAO_LABEL[licenca.tipo_intervencao]}</Campo>
            <Campo rotulo="Origem">{ORIGEM_LABEL[licenca.origem_intervencao]}</Campo>
          </Campos>
        </Secao>

        <Secao titulo="Empresas e órgãos">
          <Campos>
            <Campo rotulo={licenca.setor === 'telecom' ? 'Concessionária contratante' : 'Contratante'} largo>{contratante ?? 'Não informado'}</Campo>
            <Campo rotulo="Empresa executora" largo>{executora || 'Não informada'}</Campo>
            {subcontratada && <Campo rotulo="Subcontratada" largo>{subcontratada}</Campo>}
            {licenca.art_numero && <Campo rotulo="ART ou RRT">{licenca.art_numero}</Campo>}
          </Campos>
        </Secao>

        <Secao titulo="Objeto e serviços autorizados">
          <Campos>
            <Campo rotulo="Tipos de obra" largo>{tipos.length ? tipos.join('; ') : 'Não informados'}</Campo>
            <Campo rotulo="Descrição" largo>{licenca.escopo || 'Não informada'}</Campo>
          </Campos>
        </Secao>

        <Secao titulo="Localização">
          {licenca.licenca_trechos.length === 0 ? (
            <p className="text-tinta-500">Nenhum trecho cadastrado.</p>
          ) : (
            <ol className="list-decimal space-y-2 pl-5">
              {licenca.licenca_trechos.map((t, i) => (
                <li key={t.id ?? i}>
                  <span className="font-medium">{t.logradouro}</span>
                  {t.bairro && <span className="text-tinta-600">, {t.bairro}</span>}
                </li>
              ))}
            </ol>
          )}
        </Secao>

        <Secao titulo="Prazos">
          <Campos>
            <Campo rotulo="Início previsto">{licenca.inicio_previsto ? dataBR(licenca.inicio_previsto) : 'Não informado'}</Campo>
            <Campo rotulo="Término previsto">{licenca.fim_previsto ? dataBR(licenca.fim_previsto) : 'Não informado'}</Campo>
            {licenca.concluida_em && <Campo rotulo="Conclusão registrada">{dataBR(licenca.concluida_em)}</Campo>}
            {licenca.recomposicao_data && <Campo rotulo="Recomposição do pavimento">{dataBR(licenca.recomposicao_data)}</Campo>}
            {licenca.as_built_sei && <Campo rotulo="As Built (SEI)">{licenca.as_built_sei}</Campo>}
          </Campos>
        </Secao>

        {(licenca.contrato_numero || licenca.processo_administrativo || licenca.ordem_servico_numero || licenca.objeto_contrato) && (
          <Secao titulo="Contrato">
            <Campos>
              {licenca.contrato_numero && <Campo rotulo="Contrato">{licenca.contrato_numero}</Campo>}
              {licenca.processo_administrativo && <Campo rotulo="Processo administrativo">{licenca.processo_administrativo}</Campo>}
              {licenca.ordem_servico_numero && <Campo rotulo="Ordem de serviço">{licenca.ordem_servico_numero}</Campo>}
              {licenca.objeto_contrato && <Campo rotulo="Objeto do contrato" largo>{licenca.objeto_contrato}</Campo>}
            </Campos>
          </Secao>
        )}

        <Secao titulo="Observações">
          <p className="whitespace-pre-line">{licenca.observacoes || 'Sem observações.'}</p>
        </Secao>

        <Secao titulo="Condicionantes">
          <ol className="list-decimal space-y-2 pl-5 text-tinta-800">
            {CONDICOES_LICENCA.map((c) => <li key={c}>{c}</li>)}
          </ol>
        </Secao>

        <footer className="mt-8 border-t border-tinta-200 pt-3 text-xs text-tinta-500">
          Ficha de consulta gerada pelo CADEX em {dataBR(hoje)}. Não substitui o documento oficial, que é emitido e assinado no SEI.
        </footer>
      </article>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h3 className="mb-2 border-b border-tinta-100 pb-1 text-xs font-semibold uppercase tracking-wide text-tinta-500">{titulo}</h3>
      {children}
    </section>
  );
}

function Campos({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">{children}</dl>;
}

function Campo({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: ReactNode }) {
  return (
    <div className={largo ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs text-tinta-500">{rotulo}</dt>
      <dd className="font-medium text-tinta-900">{children}</dd>
    </div>
  );
}
