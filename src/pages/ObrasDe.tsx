import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Cabecalho } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { Empty, ErrorNote, Spinner, Titulo, linkTexto } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { SITUACAO_PUBLICA_LABEL, buscarObrasPublicas, chaveNome, nomeLimpo, type ObraPublica } from '../lib/obras';

/** Obras de uma concessionária ou órgão contratante, ou de uma executora. Só as obras, sem mapa. */
export default function ObrasDe({ tipo }: { tipo: 'concessionaria' | 'executora' }) {
  const { nome = '' } = useParams();
  const chave = chaveNome(nome);
  const [obras, setObras] = useState<ObraPublica[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => { buscarObrasPublicas().then(setObras).catch(setErro); }, []);

  // Concessionária é o contratante; na página da executora, o contratante aparece na linha da obra.
  const campo = (o: ObraPublica) => (tipo === 'concessionaria' ? o.contratante : o.executora);
  const rotuloTipo = tipo === 'concessionaria' ? 'concessionária ou órgão' : 'executora';

  const deste = useMemo(() => {
    const lista = (obras ?? []).filter((o) => {
      const v = campo(o);
      return Boolean(v) && chaveNome(v as string) === chave;
    });
    // Vigentes primeiro; dentro de cada grupo, as de prazo mais recente.
    const vigente = (o: ObraPublica) => (o.situacao === 'vigente' || o.situacao === 'aguardando_inicio' ? 0 : 1);
    return lista.sort((a, b) => vigente(a) - vigente(b) || (b.fim_previsto ?? '').localeCompare(a.fim_previsto ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras, chave, tipo]);

  const nomeExibido = deste[0] ? nomeLimpo(campo(deste[0]) as string) : nomeLimpo(nome);
  const vigentes = deste.filter((o) => o.situacao === 'vigente' || o.situacao === 'aguardando_inicio').length;

  return (
    <div className="flex min-h-screen flex-col bg-tinta-50">
      <Cabecalho />
      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <Titulo
          trilha={<><Link to="/consulta/obras" className={linkTexto}>Obras licenciadas</Link> / {nomeExibido}</>}
          titulo={nomeExibido}
          descricao={`${tipo === 'concessionaria' ? 'Concessionária ou órgão contratante' : 'Executora'}: ${vigentes} ${vigentes === 1 ? 'obra vigente' : 'obras vigentes'} · ${deste.length} ${deste.length === 1 ? 'licença no total' : 'licenças no total'}.`}
        />

        {erro ? <ErrorNote error={erro} /> : obras === null ? <Spinner /> : deste.length === 0 ? (
          <div className="rounded-xl border border-tinta-200 bg-white">
            <Empty>Nenhuma obra de {rotuloTipo} registrada com este nome.</Empty>
          </div>
        ) : (
          <section aria-label={`Obras de ${nomeExibido}`} className="rounded-xl border border-tinta-200 bg-white">
            <ul className="divide-y divide-tinta-100">
              {deste.map((o) => (
                <li key={o.codigo} className="grid gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <span className="font-medium text-tinta-900">{o.trechos[0]?.logradouro ?? 'Local não informado'}</span>
                    <span className="tabular ml-2 text-xs text-tinta-500">nº {o.numero}</span>
                    {o.trechos[0]?.bairro && <span className="ml-2 text-xs text-tinta-500">{o.trechos[0].bairro}</span>}
                    <div className="text-tinta-700">
                      {tipo === 'concessionaria' ? `Executora: ${o.executora}` : o.contratante ? `Para: ${nomeLimpo(o.contratante)}` : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-end">
                    <span className="text-xs font-semibold text-tinta-800">{SITUACAO_PUBLICA_LABEL[o.situacao]}</span>
                    <span className="tabular text-xs text-tinta-600">
                      {o.inicio_previsto ? dataBR(o.inicio_previsto) : '—'} a {o.fim_previsto ? dataBR(o.fim_previsto) : '—'}
                    </span>
                    <Link to={`/licenca/${o.codigo}`} className="text-xs font-semibold text-marca-700 hover:underline">Ver licença</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Rodape />
    </div>
  );
}
