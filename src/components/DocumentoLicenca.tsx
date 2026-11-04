import { useState } from 'react';
import { Button, ErrorNote, Field, inputClass } from './ui';
import { formatCnpj } from '../lib/cnpj';
import { lerBrasao } from '../lib/brasao';
import { useAuth } from '../lib/auth';
import { listarDaEmpresa, type Empresa, type Registro } from '../lib/empresas';
import { TIPO_OBRA_LABEL, type LicencaComTrechos } from '../lib/licencas';
import { gerarPdfLicenca, problemasParaLicenca, type DadosLicencaPdf, type PartePdf, type ResponsavelPdf } from '../lib/licencaPdf';
import { nomeOrgao, type Orgao } from '../lib/orgaos';
import type { TipoIntervencao } from '../lib/tiposIntervencao';

/**
 * Gera o PDF da licença de obra a partir do registro. O PDF vai para o SEI, onde a
 * Secretária assina digitalmente; por isso o fiscal emissor e a Secretária são
 * informados na emissão. Nada disso fica gravado: quem gera informa de novo.
 */
export function DocumentoLicenca({ licenca, empresas, orgaos, tipos }: {
  licenca: LicencaComTrechos; empresas: Empresa[]; orgaos: Orgao[]; tipos: TipoIntervencao[];
}) {
  // A prévia vale para qualquer licença; a versão oficial só sai depois do deferimento.
  const deferida = licenca.situacao === 'deferida';
  const { servidor } = useAuth();
  const [secretariaNome, setSecretariaNome] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [previaUrl, setPreviaUrl] = useState<string | null>(null);

  const porId = new Map(empresas.map((e) => [e.id, e]));
  const rotuloCatalogo = new Map(tipos.map((t) => [t.codigo, t.rotulo]));
  const rotuloDo = (codigo: string) => rotuloCatalogo.get(codigo) ?? TIPO_OBRA_LABEL[codigo as keyof typeof TIPO_OBRA_LABEL] ?? codigo;
  const todosRotulos = [
    ...tipos.filter((t) => t.setor === licenca.setor && t.ativo).map((t) => t.rotulo),
    ...licenca.tipos_obra.map(rotuloDo),
  ];
  const opcoes = [...new Set(todosRotulos)];
  const escolhidos = licenca.tipos_obra.map(rotuloDo);

  const fiscalCompleto = Boolean(servidor?.matricula && servidor.cargo);
  const pendencias = [
    ...(licenca.numero ? [] : ['Informe o número da licença no cadastro.']),
    ...(licenca.inicio_previsto ? [] : ['Informe a data de início da obra ou serviço.']),
    ...(licenca.licenca_trechos.length > 0 ? [] : ['A licença precisa de pelo menos um trecho.']),
    ...(fiscalCompleto ? [] : ['Complete sua matrícula e seu cargo no cadastro. Peça a um administrador de contas.']),
    ...(secretariaNome.trim() ? [] : ['Informe o nome da Secretária.']),
  ];

  const fecharPrevia = () => {
    setPreviaUrl((antiga) => {
      if (antiga) URL.revokeObjectURL(antiga);
      return null;
    });
  };

  const gerar = async (previa: boolean) => {
    setBusy(true);
    setErro(null);
    setAviso(null);
    try {
      const executoraEmpresa = licenca.executora_id ? porId.get(licenca.executora_id) : undefined;
      const subEmpresa = licenca.subcontratada_id ? porId.get(licenca.subcontratada_id) : undefined;
      const rts = await rtsDasEmpresas([licenca.executora_id, licenca.subcontratada_id]);
      const rtId = licenca.responsavel_tecnico_id;
      const rt = rtId ? rts.find((r) => r.id === rtId) : undefined;
      if (rtId && !rt) setAviso('O responsável técnico da licença não está mais ativo no cadastro. O PDF sai sem ele.');

      const contratanteEmpresa = licenca.contratante_id ? porId.get(licenca.contratante_id) : undefined;
      const contratanteOrgao = licenca.orgao_contratante_id ? orgaos.find((o) => o.id === licenca.orgao_contratante_id) : undefined;

      const dados: DadosLicencaPdf = {
        numero: licenca.numero ?? '',
        processo_sei: licenca.processo_sei,
        emitida_em: new Date().toISOString(),
        inicio_previsto: licenca.inicio_previsto ?? '',
        fim_previsto: licenca.fim_previsto,
        validade_ate: licenca.validade_ate ?? '',
        tipos: opcoes,
        escolhidos,
        outros_descricao: licenca.outros_descricao ?? null,
        escopo: licenca.escopo,
        trechos: [...licenca.licenca_trechos]
          .sort((a, b) => a.ordem - b.ordem)
          .map((t) => ({
            logradouro: t.logradouro,
            bairro: t.bairro,
            referencia: t.referencia,
            inicio: `${t.inicio_lat.toFixed(6)}, ${t.inicio_lng.toFixed(6)}`,
            fim: t.fim_lat != null && t.fim_lng != null ? `${t.fim_lat.toFixed(6)}, ${t.fim_lng.toFixed(6)}` : null,
          })),
        executora: executoraEmpresa ? parteDeEmpresa(executoraEmpresa)
          : { nome: licenca.executora_razao_social ?? '—', cnpj: licenca.executora_cnpj, codigo_cadex: null, contato: null, endereco: null },
        subcontratada: subEmpresa ? parteDeEmpresa(subEmpresa) : null,
        contratante: contratanteEmpresa ? parteDeEmpresa(contratanteEmpresa)
          : contratanteOrgao ? { nome: nomeOrgao(contratanteOrgao), cnpj: contratanteOrgao.cnpj, codigo_cadex: null, contato: null, endereco: null }
            : licenca.contratante_razao_social
              ? { nome: licenca.contratante_razao_social, cnpj: licenca.contratante_cnpj, codigo_cadex: null, contato: null, endereco: null }
              : null,
        responsavel_tecnico: rt ? responsavelDe(rt) : null,
        fiscal: { nome: servidor?.nome ?? '', cargo: servidor?.cargo ?? '', matricula: servidor?.matricula ?? '' },
        secretaria: { nome: secretariaNome.trim() },
        codigo_publico: licenca.codigo_publico,
      };

      // A prévia mostra o que houver; a versão oficial exige o cadastro completo.
      const problemas = previa ? [] : problemasParaLicenca(dados);
      if (problemas.length > 0) throw new Error(problemas.join(' '));

      const logo = await lerBrasao();
      const bytes = await gerarPdfLicenca(dados, logo, undefined, previa);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (previa) {
        fecharPrevia();
        setPreviaUrl(url);
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = `licenca-${(licenca.numero ?? 'sem-numero').replace(/\//g, '-')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErro(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cartao mb-10 p-5" aria-label="Documento da licença">
      <h2 className="font-display text-base font-bold text-tinta-900">Documento da licença</h2>
      <p className="mt-2 text-sm text-tinta-700">
        O PDF sai com os dados desta licença. Depois, vai para o SEI, onde a Secretária assina digitalmente.
      </p>
      <p className="mt-3 text-sm text-tinta-700">
        Fiscal emissor: <strong>{servidor?.nome ?? '—'}</strong>
        {servidor?.cargo && <> · {servidor.cargo}</>}
        {servidor?.matricula && <> · Matrícula {servidor.matricula}</>}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Secretária: nome">
          <input type="text" className={inputClass} value={secretariaNome} onChange={(e) => setSecretariaNome(e.target.value)} />
        </Field>
      </div>
      {pendencias.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-tinta-600">
          {pendencias.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void gerar(true)}>
          Visualizar prévia
        </Button>
        <Button type="button" disabled={busy || !deferida || !licenca.numero} onClick={() => void gerar(false)}>
          {busy ? 'Gerando…' : 'Gerar PDF da licença'}
        </Button>
        {!deferida && <p className="text-sm text-tinta-600">A versão oficial sai depois do deferimento.</p>}
        {aviso && <p className="text-sm text-tinta-600">{aviso}</p>}
      </div>
      {previaUrl && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-tinta-700">Prévia: marca d'água, nada foi emitido. Confira antes de gerar o PDF.</p>
            <Button type="button" variant="secondary" onClick={fecharPrevia}>Fechar prévia</Button>
          </div>
          <iframe title="Prévia da licença" src={previaUrl} className="mt-3 h-[70vh] w-full rounded-sm border border-tinta-300 bg-white" />
        </div>
      )}
      <div className="mt-2"><ErrorNote error={erro} /></div>
    </section>
  );
}

/** Dados de uma empresa como parte da licença: nome legal, CNPJ, código CADEX e contato. */
function parteDeEmpresa(e: Empresa): PartePdf {
  const endereco = [
    [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', '),
    e.bairro,
    e.cidade && e.uf ? `${e.cidade}/${e.uf}` : null,
  ].filter(Boolean).join(' · ');
  return {
    nome: e.razao_social,
    cnpj: formatCnpj(e.cnpj),
    codigo_cadex: e.codigo_cadex,
    contato: [e.telefone, e.email].filter(Boolean).join(' · ') || null,
    endereco: endereco || null,
  };
}

function responsavelDe(r: Registro): ResponsavelPdf {
  return {
    nome: String(r.nome ?? ''),
    conselho: String(r.conselho ?? ''),
    registro_numero: String(r.registro_numero ?? ''),
    registro_uf: r.registro_uf ? String(r.registro_uf) : null,
    art_rrt_numero: r.art_rrt_numero ? String(r.art_rrt_numero) : null,
  };
}

/** Responsáveis técnicos ativos das empresas da licença, para achar o que está na licença. */
async function rtsDasEmpresas(ids: (string | null)[]): Promise<Registro[]> {
  const unicos = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  const listas = await Promise.all(unicos.map((id) => listarDaEmpresa('responsaveis_tecnicos', id)));
  return listas.flat();
}
