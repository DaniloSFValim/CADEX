import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Spinner } from '../components/ui';
import CorrecaoEmLote from '../components/CorrecaoEmLote';
import { ResumoLicenca } from '../components/ExclusaoLicenca';
import { dataBR } from '../components/Situacao';
import { inconsistencias } from '../lib/admin';
import { hojeISO, listarEmpresas, type Empresa } from '../lib/empresas';
import {
  excluirLicencaDefinitivamente, listarLicencas, listarLicencasExcluidas, nomeExecutora, restaurarLicenca, type LicencaComTrechos,
} from '../lib/licencas';
import { listarContas, type Conta } from '../lib/contas';
import { listarOrgaos, type Orgao } from '../lib/orgaos';

/**
 * Manutenção: correções feitas de uma vez (com prévia e motivo) e a lixeira.
 * Fica fora da tela de licenças para não competir com a lista e a revisão do dia a dia.
 */
export default function AdminManutencao() {
  const [licencas, setLicencas] = useState<LicencaComTrechos[] | null>(null);
  const [lixeira, setLixeira] = useState<LicencaComTrechos[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [erro, setErro] = useState<unknown>(null);
  const [aviso, setAviso] = useState('');

  const carregar = () => Promise.all([listarLicencas(), listarLicencasExcluidas(), listarEmpresas(), listarOrgaos(), listarContas()])
    .then(([l, x, e, o, c]) => { setLicencas(l); setLixeira(x); setEmpresas(e); setOrgaos(o); setContas(c); })
    .catch(setErro);
  useEffect(() => { void carregar(); }, []);
  const mudou = (mensagem: string) => { setAviso(mensagem); void carregar(); };

  const hoje = hojeISO();
  const porId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const revisar = useMemo(() => (licencas ? inconsistencias(licencas, hoje, porId) : []), [licencas, hoje, porId]);

  if (!licencas && !erro) return <Spinner />;
  if (!licencas) return <ErrorNote error={erro} />;

  return (
    <div className="flex flex-col gap-10">
      {aviso && <p role="status" className="rounded-sm border-l-4 border-alta bg-alta/6 px-3 py-2 text-sm text-tinta-800">{aviso}</p>}
      <CorrecaoEmLote licencas={licencas} revisar={revisar.map((r) => r.licenca)} onAplicado={mudou} />

      <Card title={`Lixeira (${lixeira.length})`} semPadding>
        <p className="border-b border-tinta-100 px-4 py-3 text-sm text-tinta-500">
          Licenças excluídas. Ficam fora das listas, do painel, do mapa e da consulta pública. Restaurar devolve a licença como estava;
          apagar de vez remove a licença e os trechos, e o registro de auditoria permanece.
        </p>
        {lixeira.length === 0 ? <Empty>A lixeira está vazia.</Empty> : (
          <ul className="divide-y divide-tinta-100">
            {lixeira.map((l) => (
              <LinhaLixeira key={l.id} licenca={l} porId={porId} orgaos={orgaos} contas={contas} hoje={hoje} onMudou={mudou} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LinhaLixeira({ licenca: l, porId, orgaos, contas, hoje, onMudou }: {
  licenca: LicencaComTrechos; porId: Map<string, Empresa>; orgaos: Orgao[]; contas: Conta[]; hoje: string; onMudou: (m: string) => void;
}) {
  const [acao, setAcao] = useState<'' | 'apagar'>('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const quem = contas.find((c) => c.user_id === l.excluida_por);
  const nome = l.numero ?? l.processo_sei;

  const restaurar = async () => {
    setBusy(true); setErro(null);
    try { await restaurarLicenca(l.id); onMudou(`Licença ${nome} restaurada.`); }
    catch (e) { setErro(e); } finally { setBusy(false); }
  };
  const apagar = async () => {
    setBusy(true); setErro(null);
    try {
      const r = await excluirLicencaDefinitivamente(l.id);
      onMudou(`Licença ${nome} apagada definitivamente (${r.trechos_apagados} trecho${r.trechos_apagados === 1 ? '' : 's'}).`);
    } catch (e) { setErro(e); } finally { setBusy(false); }
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-medium text-tinta-900">{nome}</span>{' '}
          <Badge tom="alerta">Excluída</Badge>
          <div className="text-xs text-tinta-500">
            {l.excluida_em && dataBR(l.excluida_em.slice(0, 10))}, por {quem?.nome ?? quem?.email ?? 'outro administrador'}
            {l.excluida_motivo && <>: {l.excluida_motivo}</>}
          </div>
          <div className="text-xs text-tinta-500">{nomeExecutora(l, porId)}, {l.processo_sei}</div>
        </div>
        {acao === '' && (
          <div className="flex gap-2">
            <Button variant="secondary" className="px-3! py-1.5!" disabled={busy} onClick={() => void restaurar()}>Restaurar</Button>
            <Button variant="danger" className="px-3! py-1.5!" onClick={() => setAcao('apagar')}>Apagar de vez</Button>
          </div>
        )}
      </div>
      {acao === 'apagar' && (
        <div role="group" aria-label="Confirmar exclusão definitiva" className="max-w-xl rounded-sm border border-baixa/40 bg-baixa/4 p-4">
          <ResumoLicenca licenca={l} empresas={porId} orgaos={orgaos} hoje={hoje} />
          <p className="mt-3 text-tinta-700">
            Apaga a licença e {l.licenca_trechos.length} trecho{l.licenca_trechos.length === 1 ? '' : 's'}. Não dá para desfazer.
            O cadastro das empresas e o registro de auditoria não são apagados.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="px-3! py-1.5!" onClick={() => { setAcao(''); setErro(null); }}>Cancelar</Button>
            <Button variant="danger" className="px-3! py-1.5!" disabled={busy} onClick={() => void apagar()}>
              {busy ? 'Apagando…' : 'Apagar definitivamente'}
            </Button>
          </div>
        </div>
      )}
      <ErrorNote error={erro} />
    </li>
  );
}
