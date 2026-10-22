import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Cabecalho } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { ErrorNote, Spinner } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { SITUACAO_LABEL, podeAtuar, type SituacaoEfetiva } from '../lib/empresas';
import { TITULO_DOCUMENTO, numeroDocumento, verificarDocumento, type VerificacaoDocumento } from '../lib/documentos';

/**
 * Página aberta pelo QR Code de um documento oficial. Confere a autenticidade
 * e mostra a situação atual da inscrição, que pode ter mudado depois da emissão.
 */
export default function VerificarDocumento() {
  const { codigo = '' } = useParams();
  const [resultado, setResultado] = useState<VerificacaoDocumento | null | undefined>(undefined);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    let vivo = true;
    verificarDocumento(codigo)
      .then((r) => { if (vivo) setResultado(r); })
      .catch((e) => { if (vivo) setErro(e); });
    return () => { vivo = false; };
  }, [codigo]);

  const situacao = resultado ? (SITUACAO_LABEL[resultado.situacao_atual as SituacaoEfetiva] ?? resultado.situacao_atual) : '';
  const atuando = resultado ? podeAtuar(resultado.situacao_atual as SituacaoEfetiva) : false;

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho />
      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        <h1 className="font-display text-2xl font-semibold text-tinta-900">Verificação de documento</h1>
        <p className="mt-2 text-sm text-tinta-600">Código: <span className="tabular font-semibold">{codigo}</span></p>

        <section className="mt-8" aria-live="polite">
          <ErrorNote error={erro} />
          {!resultado && resultado !== null && !erro && <Spinner />}
          {resultado === null && (
            <div className="cartao border-l-[6px] border-baixa p-5">
              <p className="font-semibold text-baixa">Documento não encontrado</p>
              <p className="mt-1 text-sm text-tinta-600">Confira o código impresso no rodapé. Documentos falsificados ou alterados não aparecem aqui.</p>
            </div>
          )}
          {resultado && (
            <div className="cartao border-l-[6px] border-alta p-5">
              <p className="font-semibold text-alta">Documento autêntico</p>
              <h2 className="mt-2 font-semibold text-tinta-900">{TITULO_DOCUMENTO[resultado.tipo]}</h2>
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-tinta-500">Número</dt><dd className="font-semibold text-tinta-800">{numeroDocumento(resultado.numero, resultado.tipo)}</dd></div>
                <div><dt className="text-tinta-500">Emitido em</dt><dd className="text-tinta-800">{dataBR(resultado.emitido_em.slice(0, 10))}</dd></div>
                <div><dt className="text-tinta-500">Empresa</dt><dd className="text-tinta-800">{resultado.razao_social}</dd></div>
                <div><dt className="text-tinta-500">Código CADEX</dt><dd className="text-tinta-800">{resultado.codigo_cadex}</dd></div>
                <div>
                  <dt className="text-tinta-500">Situação atual da inscrição</dt>
                  <dd className={atuando ? 'font-semibold text-alta' : 'font-semibold text-baixa'}>{situacao}</dd>
                </div>
                {resultado.validade_ate && (
                  <div><dt className="text-tinta-500">Validade da inscrição</dt><dd className="text-tinta-800">{dataBR(resultado.validade_ate)}</dd></div>
                )}
              </dl>
              <p className="mt-5 text-xs text-tinta-500">
                A situação atual pode ter mudado desde a emissão. Este registro confere só a autenticidade do documento.
              </p>
            </div>
          )}
        </section>
      </main>
      <Rodape />
    </div>
  );
}
