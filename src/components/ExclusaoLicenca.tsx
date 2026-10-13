import { useState } from 'react';
import { Button, ErrorNote, Field, inputClass } from './ui';
import { dataBR } from './Situacao';
import {
  ESTADO_LICENCA_LABEL, ORIGEM_LABEL, TIPO_INTERVENCAO_LABEL, estadoLicenca, excluirLicenca, nomeExecutora,
  type LicencaComTrechos,
} from '../lib/licencas';
import { nomeEmpresa, type Empresa } from '../lib/empresas';
import { nomeOrgao, type Orgao } from '../lib/orgaos';

/** Quem contrata, pelo nome: empresa cadastrada, órgão público ou o nome informado. */
export function nomeContratante(l: LicencaComTrechos, empresas: Map<string, Empresa>, orgaos: Orgao[]): string {
  const e = l.contratante_id ? empresas.get(l.contratante_id) : undefined;
  if (e) return nomeEmpresa(e);
  const o = l.orgao_contratante_id ? orgaos.find((x) => x.id === l.orgao_contratante_id) : undefined;
  if (o) return nomeOrgao(o);
  return l.contratante_razao_social ?? '—';
}

/** Os dados que identificam a licença, para conferir antes de excluir, restaurar ou apagar. */
export function ResumoLicenca({ licenca: l, empresas, orgaos, hoje }: {
  licenca: LicencaComTrechos; empresas: Map<string, Empresa>; orgaos: Orgao[]; hoje: string;
}) {
  const linha = (rotulo: string, valor: string) => (
    <div className="flex gap-2"><dt className="w-36 flex-none text-tinta-500">{rotulo}</dt><dd className="min-w-0 text-tinta-900">{valor}</dd></div>
  );
  return (
    <dl className="grid gap-1 text-sm" aria-label="Dados da licença">
      {linha('Nº da licença', l.numero ?? 'Sem número')}
      {linha('Processo', l.processo_sei)}
      {linha('Tipo', `${TIPO_INTERVENCAO_LABEL[l.tipo_intervencao]}, ${ORIGEM_LABEL[l.origem_intervencao].toLowerCase()}`)}
      {linha('Contratante', nomeContratante(l, empresas, orgaos))}
      {linha('Executora', nomeExecutora(l, empresas))}
      {linha('Período', `${l.inicio_previsto ? dataBR(l.inicio_previsto) : '—'} a ${l.fim_previsto ? dataBR(l.fim_previsto) : '—'}`)}
      {linha('Situação', ESTADO_LICENCA_LABEL[estadoLicenca(l, hoje)])}
      {linha('Local', l.licenca_trechos[0] ? `${l.licenca_trechos[0].logradouro}${l.licenca_trechos.length > 1 ? ` e mais ${l.licenca_trechos.length - 1}` : ''}` : 'Sem trecho')}
    </dl>
  );
}

/**
 * "Excluir licença": mostra os dados, avisa das consequências e só exclui depois da confirmação.
 * A licença vai para a lixeira; dali o administrador pode restaurá-la ou apagá-la de vez.
 */
export function ExcluirLicenca({ licenca, empresas, orgaos, hoje, onExcluida, rotulo = 'Excluir licença' }: {
  licenca: LicencaComTrechos; empresas: Map<string, Empresa>; orgaos: Orgao[]; hoje: string;
  onExcluida: (mensagem: string) => void; rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  if (!aberto) {
    return <Button variant="danger" className="px-3! py-1.5!" onClick={() => setAberto(true)}>{rotulo}</Button>;
  }

  const confirmar = async () => {
    setBusy(true); setErro(null);
    try {
      await excluirLicenca(licenca.id, motivo);
      setAberto(false);
      onExcluida(`Licença ${licenca.numero ?? licenca.processo_sei} enviada para a lixeira.`);
    } catch (e) { setErro(e); } finally { setBusy(false); }
  };

  return (
    <div role="group" aria-label="Confirmar exclusão da licença"
         className="w-full max-w-xl rounded-sm border border-baixa/40 bg-baixa/4 p-4 text-left">
      <ResumoLicenca licenca={licenca} empresas={empresas} orgaos={orgaos} hoje={hoje} />
      <p className="mt-3 text-sm text-tinta-700">
        A licença sai das listas, do painel, do mapa e da consulta pública. Empresas, órgãos e o histórico de alterações não são
        apagados. Ela fica na lixeira da Administração, de onde você pode restaurá-la ou apagá-la de vez.
      </p>
      <Field label="Motivo (opcional)" className="mt-3" hint="Fica registrado junto com quem excluiu e quando.">
        <input className={inputClass} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" className="px-3! py-1.5!" onClick={() => { setAberto(false); setErro(null); }}>Cancelar</Button>
        <Button variant="danger" className="px-3! py-1.5!" disabled={busy} onClick={() => void confirmar()}>
          {busy ? 'Excluindo…' : 'Confirmar exclusão'}
        </Button>
      </div>
      <ErrorNote error={erro} />
    </div>
  );
}
