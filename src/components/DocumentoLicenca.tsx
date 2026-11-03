import { useState } from 'react';
import { Button, ErrorNote, Field, inputClass } from './ui';
import { formatCnpj } from '../lib/cnpj';
import { lerBrasao } from '../lib/brasao';
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
  const [fiscalNome, setFiscalNome] = useState('');
  const [fiscalMatricula, setFiscalMatricula] = useState('');
  const [secretariaNome, setSecretariaNome] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const porId = new Map(empresas.map((e) => [e.id, e]));
  const rotuloCatalogo = new Map(tipos.map((t) => [t.codigo, t.rotulo]));
  const rotuloDo = (codigo: string) => rotuloCatalogo.get(codigo) ?? TIPO_OBRA_LABEL[codigo as keyof typeof TIPO_OBRA_LABEL] ?? codigo;
  const todosRotulos = [
    ...tipos.filter((t) => t.setor === licenca.setor && t.ativo).map((t) => t.rotulo),
    ...licenca.tipos_obra.map(rotuloDo),
  ];
  const opcoes = [...new Set(todosRotulos)];
  const escolhidos = licenca.tipos_obra.map(rotuloDo);

  const pendencias = [
    ...(licenca.numero ? [] : ['Informe o número da licença no cadastro.']),
    ...(licenca.inicio_previsto ? [] : ['Informe a data de início da obra ou serviço.']),
    ...(licenca.licenca_trechos.length > 0 ? [] : ['A licença precisa de pelo menos um trecho.']),
    ...(fiscalNome.trim() ? [] : ['Informe o nome do fiscal emissor.']),
    ...(fiscalMatricula.trim() ? [] : ['Informe a matrícula do fiscal emissor.']),
    ...(secretariaNome.trim() ? [] : ['Informe o nome da Secretária.']),
  ];

  const gerar = async () => {
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
        fiscal: { nome: fiscalNome.trim(), matricula: fiscalMatricula.trim() },
        secretaria: { nome: secretariaNome.trim() },
        codigo_publico: licenca.codigo_publico,
      };

      const problemas = problemasParaLicenca(dados);
      if (problemas.length > 0) throw new Error(problemas.join(' '));

      const logo = await lerBrasao();
      const bytes = await gerarPdfLicenca(dados, logo);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
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
      <h2 className="font-display text-base font-bold text-tinta-900">Licença em PDF</h2>
      <p className="mt-2 text-sm text-tinta-700">
        O PDF sai com os dados desta licença. Depois, vai para o SEI, onde a Secretária assina digitalmente.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Fiscal emissor: nome">
          <input type="text" className={inputClass} value={fiscalNome} onChange={(e) => setFiscalNome(e.target.value)} />
        </Field>
        <Field label="Fiscal emissor: matrícula">
          <input type="text" className={inputClass} value={fiscalMatricula} onChange={(e) => setFiscalMatricula(e.target.value)} />
        </Field>
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
        <Button type="button" variant="secondary" disabled={busy || !licenca.numero} onClick={() => void gerar()}>
          {busy ? 'Gerando…' : 'Gerar PDF da licença'}
        </Button>
        {aviso && <p className="text-sm text-tinta-600">{aviso}</p>}
      </div>
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
