import { useEffect, useState } from 'react';
import ComunicacaoServico from '../components/ComunicacaoServico';
import { Button, Empty, ErrorNote, Spinner } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { useAuth } from '../lib/auth';
import { SITUACAO_LICENCA_LABEL, type SituacaoLicenca } from '../lib/licencas';
import { buscarMinhaEmpresa, listarLicencasDaEmpresa, type CadastroEmpresa, type LicencaEmpresa } from '../lib/portalEmpresa';

const PAPEL_EMPRESA = { representante: 'Representante', operador: 'Operador' } as const;

/**
 * Portal das empresas: o cadastro da própria empresa (só leitura), as licenças em que ela executa
 * ou contrata (visão simplificada) e a comunicação de serviço programado ao CISP (153).
 */
export default function PortalEmpresa() {
  const { empresa, signOut } = useAuth();
  const [cadastro, setCadastro] = useState<CadastroEmpresa | null>(null);
  const [licencas, setLicencas] = useState<LicencaEmpresa[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    if (!empresa) return;
    Promise.all([buscarMinhaEmpresa(), listarLicencasDaEmpresa()])
      .then(([e, l]) => { setCadastro(e); setLicencas(l); })
      .catch(setErro);
  }, [empresa]);

  if (!empresa) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-tinta-500">Portal das empresas · {PAPEL_EMPRESA[empresa.papel]}</p>
          <h1 className="font-display text-2xl font-bold text-tinta-900">{cadastro?.razao_social ?? 'Carregando…'}</h1>
        </div>
        <Button variant="secondary" onClick={() => void signOut()}>Sair</Button>
      </header>

      <ErrorNote error={erro} />
      {!cadastro || !licencas ? (erro ? null : <Spinner />) : (
        <>
          <section aria-label="Cadastro da empresa" className="cartao p-5">
            <h2 className="mb-3 font-display text-lg font-bold text-tinta-900">Cadastro</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-tinta-500">Número de cadastro</dt><dd className="tabular font-semibold text-tinta-900">{cadastro.codigo_cadex}</dd></div>
              <div><dt className="text-tinta-500">CNPJ</dt><dd className="tabular text-tinta-900">{cadastro.cnpj}</dd></div>
              <div><dt className="text-tinta-500">Situação</dt><dd className="text-tinta-900">{cadastro.ativa ? 'Ativa' : 'Desativada'}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-tinta-500">Alterações no cadastro são feitas pela SECONSER.</p>
          </section>

          <ComunicacaoServico empresa={cadastro} podeEditar emLote />

          <section aria-label="Licenças da empresa" className="cartao p-5">
            <h2 className="mb-3 font-display text-lg font-bold text-tinta-900">Licenças da empresa</h2>
            {licencas.length === 0 ? <Empty>Nenhuma licença em que a empresa execute ou contrate.</Empty> : (
              <ul className="divide-y divide-tinta-100 text-sm">
                {licencas.map((l) => (
                  <li key={l.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-tinta-900">Licença {l.numero ?? 'sem número'}</span>
                      <span className="text-xs text-tinta-600">
                        {l.executa ? 'Executa' : ''}{l.executa && l.contrata ? ' · ' : ''}{l.contrata ? 'Contrata' : ''}
                      </span>
                    </div>
                    <div className="text-tinta-700">{l.escopo}</div>
                    <div className="text-xs text-tinta-500">
                      {SITUACAO_LICENCA_LABEL[l.situacao as SituacaoLicenca] ?? l.situacao}
                      {l.inicio_previsto && ` · ${dataBR(l.inicio_previsto)}`}
                      {l.fim_previsto && ` a ${dataBR(l.fim_previsto)}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
