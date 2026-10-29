import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Cabecalho } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';
import { ErrorNote, Spinner, linkTexto } from '../components/ui';
import { dataBR } from '../components/Situacao';
import { SETOR_LABEL, SITUACAO_LABEL, type SituacaoEfetiva } from '../lib/empresas';
import { listarTipos, mapaRotulosTipos, rotuloDoTipo } from '../lib/tiposIntervencao';
import {
  ORIGEM_LABEL, TIPO_INTERVENCAO_LABEL, buscarLicencaPublica, linkMapa,
  type LicencaPublica as Dados, type SituacaoPublica,
} from '../lib/licencas';

/**
 * Página aberta pelo QR Code da placa do canteiro (art. 14). Responde à
 * pergunta do fiscal na rua: esta obra está autorizada hoje?
 */
const VEREDITO: Record<SituacaoPublica, { titulo: string; cor: string; frase: (d: Dados) => string }> = {
  vigente: {
    titulo: 'Licença vigente', cor: 'border-alta bg-alta/6 text-alta',
    frase: (d) => `Obra autorizada até ${dataBR(d.fim_previsto)}.`,
  },
  aguardando_inicio: {
    titulo: 'Fora do período', cor: 'border-atencao bg-atencao/6 text-atencao',
    frase: (d) => `A licença só vale a partir de ${dataBR(d.inicio_previsto)}. Antes disso a obra não está autorizada.`,
  },
  prazo_encerrado: {
    titulo: 'Prazo encerrado', cor: 'border-baixa bg-baixa/6 text-baixa',
    frase: (d) => `O período da obra ou serviço terminou em ${dataBR(d.fim_previsto)}. A obra não está mais autorizada.`,
  },
  concluida: {
    titulo: 'Obra concluída', cor: 'border-tinta-400 bg-tinta-50 text-tinta-700',
    frase: () => 'A obra ou serviço desta licença foi concluída. Não há obra autorizada neste local por ela.',
  },
  registro: {
    titulo: 'Registro, sem prazo', cor: 'border-tinta-400 bg-tinta-50 text-tinta-700',
    frase: () => 'Licença vinculada a órgão público. Ela é registrada para controle e não tem prazo de validade.',
  },
  cancelada: {
    titulo: 'Licença cancelada', cor: 'border-baixa bg-baixa/6 text-baixa',
    frase: () => 'Esta licença foi cancelada pela SECONSER. A obra não está autorizada.',
  },
};

const nome = (e: { razao_social: string; nome_fantasia: string | null }) =>
  e.nome_fantasia?.trim() ? `${e.razao_social} (${e.nome_fantasia})` : e.razao_social;

export default function LicencaPublica() {
  const { codigo = '' } = useParams();
  const [d, setD] = useState<Dados | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => { buscarLicencaPublica(codigo).then(setD).catch(setError); }, [codigo]);

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho />
      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="flex items-center gap-2.5 text-sm font-medium text-tinta-500">
                    Licença de obra em via pública
        </p>
        <ErrorNote error={error} />
        {d && <h1 className="sr-only">Licença nº {d.numero}</h1>}
        {d === undefined && !error && <Spinner label="Consultando a licença…" />}
        {d === null && (
          <div className="mt-4 rounded-2xl border border-baixa bg-baixa/6 p-5 sm:p-6">
            <h1 className="font-display text-2xl font-bold text-baixa">Licença não encontrada</h1>
            <p className="mt-2 text-sm text-tinta-700">
              Este código não corresponde a nenhuma licença emitida pela SECONSER. Uma placa com este
              QR Code não comprova autorização para a obra.
            </p>
          </div>
        )}
        {d && <Conteudo d={d} />}
      </main>
      <Rodape />
    </div>
  );
}

function Conteudo({ d }: { d: Dados }) {
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  useEffect(() => { listarTipos().then((t) => setRotulos(mapaRotulosTipos(t))).catch(() => setRotulos({})); }, []);
  const v = VEREDITO[d.situacao];
  // A executora pode faltar (registro sem empresa vinculada): a página mostra o que houver, sem quebrar.
  const executora = d.executora ?? { razao_social: '', nome_fantasia: null, codigo_cadex: null, situacao_cadex: null };
  const sitCadex = executora.situacao_cadex as SituacaoEfetiva | null;
  return (
    <>
      <div className={`mt-4 rounded-2xl border p-5 sm:p-6 ${v.cor}`} role="status">
        <h1 className="flex items-center gap-3 font-display text-3xl font-bold leading-tight tracking-[-0.01em]">
          <span className="h-3 w-3 flex-none rounded-full bg-current" aria-hidden />
          {v.titulo}
        </h1>
        <p className="mt-3 text-base text-tinta-800">{v.frase(d)}</p>
        <p className="mt-3 text-xs text-tinta-500">Consulta de {dataBR(d.hoje)}, com os dados da SECONSER neste momento.</p>
      </div>

      <dl className="cartao mt-6 grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
        <Item rotulo="Licença nº"><span className="tabular text-lg font-semibold">{d.numero}</span></Item>
        <Item rotulo="Início da obra ou serviço">
          <span className="tabular">{dataBR(d.inicio_previsto)}</span>
        </Item>
        <Item rotulo="Fim da obra ou serviço">
          <span className="tabular">{dataBR(d.fim_previsto)}</span>
        </Item>
        <Item rotulo="Empresa executora" largo>
          {nome(executora) || 'Não informada'}
          <span className="block text-sm text-tinta-500">
            {executora.codigo_cadex && sitCadex
              ? `${executora.codigo_cadex}; inscrição no CADEX hoje: ${SITUACAO_LABEL[sitCadex] ?? sitCadex}`
              : 'Sem inscrição no CADEX: licença emitida antes do cadastro.'}
          </span>
        </Item>
        {d.contratante && (
          <Item rotulo={d.setor === 'telecom' ? 'Concessionária contratante' : 'Contratante'} largo>
            {nome(d.contratante)}
            {d.contratante.codigo_cadex && <span className="block text-sm text-tinta-500">{d.contratante.codigo_cadex}</span>}
          </Item>
        )}
        <Item rotulo="Tipo de intervenção">{TIPO_INTERVENCAO_LABEL[d.tipo_intervencao]}</Item>
        <Item rotulo="Origem">{ORIGEM_LABEL[d.origem]}</Item>
        <Item rotulo="Setor">{SETOR_LABEL[d.setor]}</Item>
        {d.imovel_endereco && <Item rotulo="Imóvel atendido" largo>{d.imovel_endereco}</Item>}
        <Item rotulo="Tipo de obra">{d.tipos_obra.map((t) => rotuloDoTipo(t, rotulos)).join(', ')}</Item>
        <Item rotulo="Escopo" largo>{d.escopo}</Item>
      </dl>

      <h2 className="mt-8 font-display text-lg font-bold text-tinta-900">
        {d.trechos.length > 1 ? `Locais autorizados (${d.trechos.length})` : 'Local autorizado'}
      </h2>
      <ul className="cartao mt-3 divide-y divide-tinta-100 overflow-hidden">
        {d.trechos.map((t, i) => (
          <li key={i} className="px-4 py-3.5">
            <span className="font-medium text-tinta-900">{t.logradouro}</span>
            {t.bairro && <span className="text-tinta-500">, {t.bairro}</span>}
            {t.referencia && <span className="block text-sm text-tinta-600">{t.referencia}</span>}
            <a className={`${linkTexto} mt-1 inline-block text-sm`} href={linkMapa(t)} target="_blank" rel="noopener noreferrer">
              {t.fim_lat != null ? 'Ver o trecho no mapa' : 'Ver o ponto no mapa'}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-tinta-600">
        Para conferir a inscrição das empresas, use a <Link to="/consulta" className={linkTexto}>consulta pública do CADEX</Link>.
      </p>
    </>
  );
}

function Item({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: React.ReactNode }) {
  return (
    <div className={largo ? 'sm:col-span-2' : ''}>
      <dt className="text-sm font-medium text-tinta-500">{rotulo}</dt>
      <dd className="mt-0.5 text-base text-tinta-900">{children}</dd>
    </div>
  );
}
