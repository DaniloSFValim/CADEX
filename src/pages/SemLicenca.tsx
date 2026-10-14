import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Empty, ErrorNote, Field, Spinner, Titulo, botaoLink, inputClass, tabela } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { SETORES, SETOR_LABEL, atuaNoSetor, hojeISO, listarEmpresas, nomeEmpresa, type Empresa, type Setor } from '../lib/empresas';
import { TIPO_INTERVENCAO_LABEL, TIPOS_INTERVENCAO, type TipoIntervencao, coordenadaTexto } from '../lib/licencas';
import { listarOrgaos, nomeOrgao, type Orgao } from '../lib/orgaos';
import {
  FORM_SEM_LICENCA_VAZIO, MODO_EXECUCAO_LABEL, SITUACAO_SEM_LICENCA_LABEL, listarSemLicenca, montarSemLicenca,
  salvarSemLicenca, type FormSemLicenca, type IntervencaoSemLicenca, type ModoExecucao, type SituacaoSemLicenca,
} from '../lib/semLicenca';

/** Lista das obras e serviços sem licença. Só gestor e licenciador criam ou alteram. */
export default function SemLicenca() {
  const { podeLicenciar } = useAuth();
  const [lista, setLista] = useState<IntervencaoSemLicenca[] | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  const porEmpresa = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const porOrgao = useMemo(() => new Map(orgaos.map((o) => [o.id, o])), [orgaos]);

  useEffect(() => {
    Promise.all([listarSemLicenca(), listarEmpresas(), listarOrgaos()])
      .then(([l, e, o]) => { setLista(l); setEmpresas(e); setOrgaos(o); })
      .catch(setErro);
  }, []);

  if (!lista && !erro) return <Spinner />;

  return (
    <>
      <Titulo
        trilha={<><Link to="/obras" className="hover:underline">Obras</Link> / Sem licença</>}
        titulo="Obras e serviços sem licença"
        descricao="Intervenções que não passam pelo processo de licença de obra. Ficam fora das licenças, da consulta pública e dos dados abertos."
        acoes={podeLicenciar && <Link to="/obras/sem-licenca/nova" className={botaoLink.primary}>Registrar sem licença</Link>}
      />
      {aviso && <p role="status" className="mb-4 border-l-4 border-alta bg-alta/6 px-4 py-2 text-sm text-tinta-800">{aviso}</p>}
      <ErrorNote error={erro} />
      <Card title={`Registros (${lista?.length ?? 0})`} semPadding>
        {lista && lista.length === 0 && <Empty>Nenhum registro sem licença ainda.</Empty>}
        {lista && lista.length > 0 && (
          <div className={tabela.moldura}>
            <table className={tabela.tabela}>
              <thead className={tabela.cabeca}>
                <tr>
                  <th className={tabela.th}>Intervenção</th>
                  <th className={tabela.th}>Contratante</th>
                  <th className={tabela.th}>Executora</th>
                  <th className={tabela.th}>Período</th>
                  <th className={tabela.th}>Situação</th>
                  <th className={tabela.th}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} className={tabela.linha}>
                    <td className={tabela.td}>
                      <div className="font-medium text-tinta-900">{r.escopo}</div>
                      <div className="text-xs text-tinta-500">{TIPO_INTERVENCAO_LABEL[r.tipo_intervencao]}, {SETOR_LABEL[r.setor]}, {r.logradouro}{r.bairro ? `, ${r.bairro}` : ''}</div>
                    </td>
                    <td className={tabela.td}>{porOrgao.get(r.contratante_orgao_id) ? nomeOrgao(porOrgao.get(r.contratante_orgao_id)!) : '—'}</td>
                    <td className={tabela.td}>
                      {r.executora_modo === 'propria_orgao' ? 'Própria do órgão'
                        : r.executora_modo === 'empresa' ? (porEmpresa.get(r.executora_id ?? '') ? nomeEmpresa(porEmpresa.get(r.executora_id ?? '')!) : '—')
                          : `${r.executora_razao_social ?? '—'} (fora do cadastro)`}
                    </td>
                    <td className={`${tabela.td} tabular whitespace-nowrap text-xs`}>
                      {r.inicio_previsto ? dataBR(r.inicio_previsto) : '—'} a {r.fim_previsto ? dataBR(r.fim_previsto) : '—'}
                    </td>
                    <td className={tabela.td}>{SITUACAO_SEM_LICENCA_LABEL[r.situacao]}</td>
                    <td className={`${tabela.td} text-right`}>
                      {podeLicenciar && <Link to={`/obras/sem-licenca/${r.id}`} className="font-semibold text-marca-700 hover:underline">Editar</Link>}
                      {!podeLicenciar && <span className="text-xs text-tinta-500">Consulta</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** Formulário de cadastro/edição de uma obra ou serviço sem licença. */
export function FormSemLicencaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { podeLicenciar } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [orgaos, setOrgaos] = useState<Orgao[] | null>(null);
  const [atual, setAtual] = useState<IntervencaoSemLicenca | null>(null);
  const [carregado, setCarregado] = useState(!id);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([listarEmpresas(), listarOrgaos(), id ? listarSemLicenca() : Promise.resolve(null)])
      .then(([e, o, l]) => {
        setEmpresas(e); setOrgaos(o);
        if (l) setAtual(l.find((x) => x.id === id) ?? null);
        setCarregado(true);
      })
      .catch(setErro);
  }, [id]);

  if (!empresas || !orgaos || !carregado) return <Spinner />;
  if (id && !atual) return <ErrorNote error={new Error('Registro não encontrado.')} />;

  return (
    <>
      <Titulo
        trilha={<><Link to="/obras/sem-licenca" className="hover:underline">Sem licença</Link> / {atual ? 'editar' : 'novo'}</>}
        titulo={atual ? 'Editar registro sem licença' : 'Registrar obra ou serviço sem licença'}
        descricao="Para intervenções que não passam pelo processo de licença. Se a licença sair depois, ela é cadastrada à parte e vinculada aqui."
      />
      <FormSemLicenca
        key={atual?.id ?? 'novo'}
        atual={atual}
        empresas={empresas}
        orgaos={orgaos}
        somenteLeitura={!podeLicenciar}
        onSalvo={(mensagem) => navigate('/obras/sem-licenca', { state: { aviso: mensagem } })}
      />
      <ErrorNote error={erro} />
    </>
  );
}

function paraForm(r: IntervencaoSemLicenca): FormSemLicenca {
  const s = (v: string | null) => v ?? '';
  return {
    setor: r.setor, tipo_intervencao: r.tipo_intervencao, escopo: r.escopo, contratante_orgao_id: r.contratante_orgao_id,
    executora_modo: r.executora_modo, executora_id: s(r.executora_id), executora_razao_social: s(r.executora_razao_social),
    executora_cnpj: s(r.executora_cnpj), logradouro: r.logradouro, bairro: s(r.bairro), referencia: s(r.referencia),
    inicio: coordenadaTexto(r.inicio_lat, r.inicio_lng),
    fim: r.fim_lat != null && r.fim_lng != null ? coordenadaTexto(r.fim_lat, r.fim_lng) : '',
    inicio_previsto: s(r.inicio_previsto), fim_previsto: s(r.fim_previsto), situacao: r.situacao,
    concluida_em: s(r.concluida_em), processo_sei: s(r.processo_sei), contrato_numero: s(r.contrato_numero),
    processo_administrativo: s(r.processo_administrativo), ordem_servico_numero: s(r.ordem_servico_numero),
    observacoes: s(r.observacoes),
  };
}

function FormSemLicenca({ atual, empresas, orgaos, somenteLeitura, onSalvo }: {
  atual: IntervencaoSemLicenca | null; empresas: Empresa[]; orgaos: Orgao[]; somenteLeitura: boolean;
  onSalvo: (mensagem: string) => void;
}) {
  const [f, setF] = useState<FormSemLicenca>(atual ? paraForm(atual) : { ...FORM_SEM_LICENCA_VAZIO, inicio_previsto: hojeISO() });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const ro = somenteLeitura;
  const set = <K extends keyof FormSemLicenca>(k: K, v: FormSemLicenca[K]) => setF((x) => ({ ...x, [k]: v }));

  // Empresa e órgão que servem ao setor escolhido.
  const empresasDoSetor = empresas.filter((e) => e.ativa && atuaNoSetor(e, f.setor));
  const orgaosDoSetor = orgaos.filter((o) => o.setores.length === 0 || o.setores.includes(f.setor));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const m = montarSemLicenca(f);
    if ('erro' in m) { setErro(new Error(m.erro)); return; }
    setBusy(true);
    try {
      await salvarSemLicenca(m.linha, atual?.id);
      onSalvo(atual ? 'Registro atualizado.' : 'Obra ou serviço sem licença registrado.');
    } catch (err) { setErro(err); } finally { setBusy(false); }
  }

  const campo = (k: keyof FormSemLicenca) => ({ value: f[k] as string, disabled: ro, onChange: (e: { target: { value: string } }) => set(k, e.target.value as never) });

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <Card title="O que é">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Setor" required>
            <select className={inputClass} required {...campo('setor')} onChange={(e) => set('setor', e.target.value as Setor)}>
              {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Tipo" required>
            <select className={inputClass} required {...campo('tipo_intervencao')} onChange={(e) => set('tipo_intervencao', e.target.value as TipoIntervencao | '')}>
              <option value="">Selecione</option>
              {TIPOS_INTERVENCAO.map((t) => <option key={t} value={t}>{TIPO_INTERVENCAO_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Situação" required>
            <select className={inputClass} required {...campo('situacao')} onChange={(e) => set('situacao', e.target.value as SituacaoSemLicenca)}>
              {(Object.keys(SITUACAO_SEM_LICENCA_LABEL) as SituacaoSemLicenca[]).map((s) => <option key={s} value={s}>{SITUACAO_SEM_LICENCA_LABEL[s]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Escopo" required className="mt-4" hint="O que será feito, em uma ou duas frases.">
          <textarea className={inputClass} rows={2} required {...campo('escopo')} />
        </Field>
      </Card>

      <Card title="Quem contrata e quem executa">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Órgão contratante" required hint="Inclusive a própria SECONSER, quando ela contrata ou executa.">
            <select className={inputClass} required {...campo('contratante_orgao_id')}>
              <option value="">Selecione</option>
              {orgaosDoSetor.map((o) => <option key={o.id} value={o.id}>{nomeOrgao(o)}</option>)}
            </select>
          </Field>
          <Field label="Quem executa" required>
            <select className={inputClass} required {...campo('executora_modo')} onChange={(e) => set('executora_modo', e.target.value as ModoExecucao)}>
              {(Object.keys(MODO_EXECUCAO_LABEL) as ModoExecucao[]).map((m) => <option key={m} value={m}>{MODO_EXECUCAO_LABEL[m]}</option>)}
            </select>
          </Field>
          {f.executora_modo === 'empresa' && (
            <Field label="Empresa executora" required className="sm:col-span-2">
              <select className={inputClass} required {...campo('executora_id')}>
                <option value="">Selecione</option>
                {empresasDoSetor.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
              </select>
            </Field>
          )}
          {f.executora_modo === 'sem_cadastro' && (
            <>
              <Field label="Razão social da empresa" required>
                <input className={inputClass} required {...campo('executora_razao_social')} />
              </Field>
              <Field label="CNPJ" hint="Opcional, 14 dígitos.">
                <input className={`${inputClass} tabular`} inputMode="numeric" {...campo('executora_cnpj')} />
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card title="Onde e quando">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logradouro" required><input className={inputClass} required {...campo('logradouro')} /></Field>
          <Field label="Bairro"><input className={inputClass} {...campo('bairro')} /></Field>
          <Field label="Início (coordenadas)" required hint="Cole do Google Maps: lat, lng. Deve estar em Niterói.">
            <input className={`${inputClass} tabular`} required placeholder="-22.895000, -43.123000" {...campo('inicio')} />
          </Field>
          <Field label="Fim (coordenadas, se for um trecho)">
            <input className={`${inputClass} tabular`} placeholder="Opcional" {...campo('fim')} />
          </Field>
          <Field label="Início previsto"><input type="date" className={inputClass} {...campo('inicio_previsto')} /></Field>
          <Field label="Fim previsto"><input type="date" className={inputClass} {...campo('fim_previsto')} /></Field>
          {f.situacao === 'concluida' && (
            <Field label="Data de conclusão" required><input type="date" className={inputClass} required {...campo('concluida_em')} /></Field>
          )}
        </div>
      </Card>

      <Card title="Documentos (opcionais)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Processo SEI"><input className={`${inputClass} tabular`} {...campo('processo_sei')} /></Field>
          <Field label="Contrato"><input className={`${inputClass} tabular`} {...campo('contrato_numero')} /></Field>
          <Field label="Processo administrativo"><input className={`${inputClass} tabular`} {...campo('processo_administrativo')} /></Field>
          <Field label="Ordem de serviço"><input className={`${inputClass} tabular`} {...campo('ordem_servico_numero')} /></Field>
        </div>
        <Field label="Observações" className="mt-4"><textarea className={inputClass} rows={2} {...campo('observacoes')} /></Field>
      </Card>

      {!ro && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : atual ? 'Salvar alterações' : 'Registrar'}</Button>
          <Link to="/obras/sem-licenca" className="text-sm font-semibold text-tinta-600 hover:underline">Cancelar</Link>
        </div>
      )}
      <ErrorNote error={erro} />
    </form>
  );
}
