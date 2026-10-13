import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QrCode } from '../components/QrCode';
import { Button, ErrorNote, Spinner } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { buscarEmpresa, type Empresa } from '../lib/empresas';
import { TIPO_OBRA_LABEL, buscarLicenca, urlPublicaLicenca, type LicencaComTrechos } from '../lib/licencas';

/**
 * Placa do canteiro (art. 14) para imprimir: razão social da executora,
 * nº da licença, escopo, data prevista de encerramento e o QR Code da
 * página pública. Sem cabeçalho nem menu, como a ficha da empresa.
 */
export default function PlacaLicenca() {
  const { id = '' } = useParams();
  const [l, setL] = useState<LicencaComTrechos | null>(null);
  const [exec, setExec] = useState<Empresa | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    buscarLicenca(id)
      .then(async (x) => { setL(x); setExec(x.executora_id ? await buscarEmpresa(x.executora_id) : null); })
      .catch(setError);
  }, [id]);

  if (error) return <div className="p-8"><ErrorNote error={error} /></div>;
  if (!l || exec === undefined) return <Spinner />;
  if (l.situacao !== 'deferida') {
    return (
      <div className="mx-auto max-w-xl p-8 text-sm text-tinta-700">
        Só licença deferida tem placa. <Link to={`/obras/${l.id}`} className="underline">Voltar à licença</Link>
      </div>
    );
  }

  const url = urlPublicaLicenca(l.codigo_publico);
  return (
    <div className="min-h-screen bg-tinta-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <Link to={`/obras/${l.id}`} className="text-sm text-tinta-600 hover:underline">Voltar à licença</Link>
        <Button onClick={() => window.print()}>Imprimir placa</Button>
      </div>

      <article className="mx-auto flex max-w-[210mm] flex-col bg-white p-[14mm] shadow-sm print:shadow-none"
               style={{ minHeight: '148mm' }}>
        <header className="flex items-center justify-between gap-6 border-b-2 border-marca-800 pb-4">
          <img src="/logo-prefeitura-seconser.png" alt="Prefeitura de Niterói, SECONSER" className="h-14 w-auto" />
          <div className="text-right">
            <div className="text-xs font-semibold text-tinta-500">Obra licenciada</div>
            <div className="tabular text-3xl font-extrabold text-marca-800">Licença nº {l.numero}</div>
          </div>
        </header>

        <div className="mt-6 grid flex-1 grid-cols-[1fr_auto] gap-8">
          <dl className="space-y-4">
            <div>
              <dt className="text-xs font-semibold text-tinta-500">Empresa executora</dt>
              <dd className="text-2xl font-bold leading-tight text-tinta-900">{exec?.razao_social ?? l.executora_razao_social}</dd>
              {exec && <dd className="tabular text-sm text-tinta-600">{exec.codigo_cadex}</dd>}
            </div>
            <div>
              <dt className="text-xs font-semibold text-tinta-500">Escopo</dt>
              <dd className="text-lg text-tinta-900">{l.escopo}</dd>
              <dd className="text-sm text-tinta-600">{l.tipos_obra.map((t) => TIPO_OBRA_LABEL[t]).join(', ')}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-tinta-500">Fim da obra ou serviço</dt>
              <dd className="tabular text-2xl font-bold text-tinta-900">{dataBR(l.fim_previsto)}</dd>
            </div>
          </dl>
          <div className="flex flex-col items-center text-center">
            <QrCode texto={url} tamanho={200} />
            <p className="mt-2 max-w-[200px] text-xs text-tinta-600">
              Aponte a câmera para conferir a licença no site da Prefeitura.
            </p>
          </div>
        </div>

        <footer className="mt-6 border-t border-tinta-200 pt-3 text-[11px] text-tinta-500">
          Resolução Conjunta SECONSER/SEOP nº 001/2026, art. 14. Endereço de conferência: <span className="break-all">{url}</span>
        </footer>
      </article>
    </div>
  );
}
