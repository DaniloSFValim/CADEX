import { useMemo, useState } from 'react';
import { Button, Card, ErrorNote, inputClass, tabela } from './ui';
import { corrigirLicencasEmLote, erroCorrecao, erroMotivo } from '../lib/correcaoLicencas';
import type { LicencaComTrechos } from '../lib/licencas';

interface Linha {
  licenca: LicencaComTrechos;
  numero: string;
  processo_sei: string;
}

interface Props {
  /** Todas as licenças ativas, para a busca de quem quer corrigir uma que a revisão não apontou. */
  licencas: LicencaComTrechos[];
  /** Licenças que a revisão já aponta, para adicionar de uma vez. */
  revisar: LicencaComTrechos[];
  /** Chamado depois de gravar, com a mensagem a mostrar. */
  onAplicado: (mensagem: string) => void;
}

const MAX_BUSCA = 8;

/**
 * Correção em lote, caso a caso: o administrador escolhe cada licença, digita o valor
 * certo e vê a prévia antes de gravar. Tudo entra numa só transação no banco.
 */
export default function CorrecaoEmLote({ licencas, revisar, onAplicado }: Props) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [busca, setBusca] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  const idsNaLista = useMemo(() => new Set(linhas.map((l) => l.licenca.id)), [linhas]);
  const resultadosBusca = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return licencas
      .filter((l) => !idsNaLista.has(l.id))
      .filter((l) => [l.numero ?? '', l.processo_sei].some((s) => s.toLowerCase().includes(t)))
      .slice(0, MAX_BUSCA);
  }, [busca, licencas, idsNaLista]);

  const adicionar = (ls: LicencaComTrechos[]) => {
    setErro(null);
    setConfirmado(false);
    setLinhas((atual) => {
      const ids = new Set(atual.map((l) => l.licenca.id));
      const novas = ls.filter((l) => !ids.has(l.id)).map((l) => ({ licenca: l, numero: l.numero ?? '', processo_sei: l.processo_sei }));
      return [...atual, ...novas];
    });
  };

  const alterar = (id: string, campo: 'numero' | 'processo_sei', valor: string) => {
    setConfirmado(false);
    setLinhas((atual) => atual.map((l) => (l.licenca.id === id ? { ...l, [campo]: valor } : l)));
  };

  const remover = (id: string) => {
    setConfirmado(false);
    setLinhas((atual) => atual.filter((l) => l.licenca.id !== id));
  };

  // Só conta como alteração o que muda de fato; campo igual ao atual não é gravado.
  const mudancas = linhas.map((l) => {
    const numeroNovo = l.numero.trim();
    const seiNovo = l.processo_sei.trim();
    const mudaNumero = numeroNovo !== '' && numeroNovo !== (l.licenca.numero ?? '');
    const mudaSei = seiNovo !== '' && seiNovo !== l.licenca.processo_sei;
    const erro = (mudaNumero || mudaSei || numeroNovo === '' || seiNovo === '')
      ? erroCorrecao({ numero: numeroNovo, processo_sei: seiNovo })
      : null;
    return { linha: l, mudaNumero, mudaSei, erro, muda: mudaNumero || mudaSei };
  });
  const alteracoes = mudancas.filter((m) => m.muda);
  const temErro = mudancas.some((m) => m.erro && m.muda);
  const errosMotivo = erroMotivo(motivo);
  const podeAplicar = alteracoes.length > 0 && !temErro && confirmado && !errosMotivo && !aplicando;

  const aplicar = async () => {
    setAplicando(true);
    setErro(null);
    try {
      const feitas = await corrigirLicencasEmLote(alteracoes.map((m) => ({
        id: m.linha.licenca.id,
        ...(m.mudaNumero ? { numero: m.linha.numero } : {}),
        ...(m.mudaSei ? { processo_sei: m.linha.processo_sei } : {}),
      })), motivo);
      setLinhas([]);
      setConfirmado(false);
      setMotivo('');
      onAplicado(`${feitas} licença${feitas === 1 ? '' : 's'} corrigida${feitas === 1 ? '' : 's'} em lote. Cada alteração ficou no histórico.`);
    } catch (e) {
      setErro(e);
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Card title={`Correção em lote${linhas.length ? ` (${linhas.length})` : ''}`} semPadding>
      <div className="flex flex-col gap-4 p-4 text-sm">
        <p className="text-tinta-600">
          Para erro de digitação no número, no ano ou no processo SEI. Escolha cada licença, digite o valor certo e confira a prévia.
          Tudo é gravado de uma vez: se uma linha estiver errada, nada é alterado. Cada alteração fica no histórico com o seu nome e o motivo.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => adicionar(revisar)} disabled={revisar.length === 0}>
            Adicionar as {revisar.length} com aviso de revisão
          </Button>
        </div>

        <div>
          <label className="block text-xs font-medium text-tinta-600" htmlFor="busca-lote">Adicionar outra licença</label>
          <input id="busca-lote" className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)}
                 placeholder="Nº da licença ou processo SEI" />
          {resultadosBusca.length > 0 && (
            <ul className="mt-2 divide-y divide-tinta-100 border border-tinta-100">
              {resultadosBusca.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="tabular">{l.numero ?? 'Sem número'} · {l.processo_sei}</span>
                  <Button type="button" variant="secondary" onClick={() => adicionar([l])}>Adicionar</Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {linhas.length > 0 && (
          <div className={tabela.moldura}>
            <table className={tabela.tabela}>
              <thead className={tabela.cabeca}>
                <tr>
                  <th className={tabela.th}>Licença atual</th>
                  <th className={tabela.th}>Número</th>
                  <th className={tabela.th}>Processo SEI</th>
                  <th className={tabela.th}><span className="sr-only">Remover</span></th>
                </tr>
              </thead>
              <tbody>
                {mudancas.map(({ linha: l, mudaNumero, mudaSei, erro: e }) => (
                  <tr key={l.licenca.id} className={tabela.linha}>
                    <td className={tabela.td}>
                      <div className="tabular font-medium">{l.licenca.numero ?? 'Sem número'}</div>
                      <div className="tabular text-xs text-tinta-500">{l.licenca.processo_sei}</div>
                    </td>
                    <td className={tabela.td}>
                      <input className={inputClass} aria-label={`Número da licença ${l.licenca.numero ?? l.licenca.id}`}
                             value={l.numero} onChange={(e2) => alterar(l.licenca.id, 'numero', e2.target.value)} />
                      {mudaNumero && <div className="mt-1 text-xs text-tinta-600">de {l.licenca.numero ?? 'vazio'}</div>}
                    </td>
                    <td className={tabela.td}>
                      <input className={inputClass} aria-label={`Processo SEI da licença ${l.licenca.numero ?? l.licenca.id}`}
                             value={l.processo_sei} onChange={(e2) => alterar(l.licenca.id, 'processo_sei', e2.target.value)} />
                      {mudaSei && <div className="mt-1 text-xs text-tinta-600">de {l.licenca.processo_sei}</div>}
                      {e && (mudaNumero || mudaSei) && <div role="alert" className="mt-1 text-xs text-baixa">{e}</div>}
                    </td>
                    <td className={`${tabela.td} text-right`}>
                      <Button type="button" variant="secondary" onClick={() => remover(l.licenca.id)}>Remover</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {linhas.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-tinta-100 pt-4">
            <p className="font-medium text-tinta-800">
              Prévia: {alteracoes.length} licença{alteracoes.length === 1 ? '' : 's'} com alteração
              {alteracoes.length === 0 ? ' (preencha um valor diferente do atual).' : '.'}
            </p>
            <div>
              <label className="block text-xs font-medium text-tinta-600" htmlFor="motivo-lote">Motivo da correção</label>
              <textarea id="motivo-lote" className={inputClass} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Ex.: processo digitado com um dígito a mais, conferido no SEI" />
              {motivo.length > 0 && errosMotivo && <p className="mt-1 text-xs text-tinta-600">{errosMotivo}</p>}
            </div>
            <label className="flex items-center gap-2 text-tinta-700">
              <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} disabled={alteracoes.length === 0} />
              Confirmo as {alteracoes.length} alterações acima.
            </label>
            {temErro && <p className="text-xs text-baixa">Corrija as linhas em vermelho antes de aplicar.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={aplicar} disabled={!podeAplicar}>
                {aplicando ? 'Aplicando…' : `Aplicar ${alteracoes.length} correção${alteracoes.length === 1 ? '' : 'ões'}`}
              </Button>
            </div>
            {erro ? <ErrorNote error={erro} /> : null}
          </div>
        )}
      </div>
    </Card>
  );
}
