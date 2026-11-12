import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, ErrorNote, Spinner, tabela } from './ui';
import { dataBR } from './Situacao';
import { nomeEmpresa, type Empresa } from '../lib/empresas';
import { MODO_EXECUCAO_LABEL, SITUACAO_SEM_LICENCA_LABEL, listarSemLicenca, type IntervencaoSemLicenca } from '../lib/semLicenca';

/**
 * Obras e serviços sem licença, numa seção própria abaixo da lista de licenças. Não entram na
 * lista de licenças: não têm prorrogação, histórico nem exclusão. O botão "Abrir" leva ao cadastro.
 */
export default function ObrasSemLicencaSecao({ empresas }: { empresas: Empresa[] }) {
  const [obras, setObras] = useState<IntervencaoSemLicenca[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  useEffect(() => {
    let vivo = true;
    listarSemLicenca().then((l) => { if (vivo) setObras(l); }).catch((e) => { if (vivo) setErro(e); });
    return () => { vivo = false; };
  }, []);
  const porId = new Map(empresas.map((e) => [e.id, e]));
  const executora = (o: IntervencaoSemLicenca) => {
    if (o.executora_modo === 'propria_orgao') return 'Própria do órgão';
    if (o.executora_modo === 'empresa') {
      const e = o.executora_id ? porId.get(o.executora_id) : undefined;
      return e ? nomeEmpresa(e) : '—';
    }
    return o.executora_razao_social ?? '—';
  };
  return (
    <Card title={`Obras e serviços sem licença${obras ? ` (${obras.length})` : ''}`} semPadding>
      <ErrorNote error={erro} />
      {!obras && !erro && <Spinner />}
      {obras && obras.length === 0 && <Empty>Nenhuma obra ou serviço sem licença registrado.</Empty>}
      {obras && obras.length > 0 && (
        <div className={tabela.moldura}>
          <table className={tabela.tabela}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.th}>Obra ou serviço</th>
                <th className={tabela.th}>Quem executa</th>
                <th className={tabela.th}>Local</th>
                <th className={tabela.th}>Período previsto</th>
                <th className={tabela.th}>Situação</th>
                <th className={tabela.th}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {obras.map((o) => (
                <tr key={o.id} className={tabela.linha}>
                  <td className={tabela.td}>
                    <div className="font-medium">{o.escopo}</div>
                    <div className="text-xs text-tinta-500">{o.publica ? 'Obra pública' : 'Sem licença'}</div>
                  </td>
                  <td className={tabela.td}>
                    <div>{executora(o)}</div>
                    <div className="text-xs text-tinta-500">{MODO_EXECUCAO_LABEL[o.executora_modo]}</div>
                  </td>
                  <td className={tabela.td}>{o.logradouro}{o.bairro ? `, ${o.bairro}` : ''}</td>
                  <td className={`${tabela.td} tabular`}>
                    {o.inicio_previsto ? dataBR(o.inicio_previsto) : '—'} a {o.fim_previsto ? dataBR(o.fim_previsto) : '—'}
                  </td>
                  <td className={tabela.td}>{SITUACAO_SEM_LICENCA_LABEL[o.situacao]}</td>
                  <td className={`${tabela.td} text-right`}>
                    <Link to={`/obras/sem-licenca/${o.id}`} className="font-semibold text-marca-700 hover:underline">Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
