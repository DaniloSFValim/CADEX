import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorNote, Spinner, linkTexto, tabela } from '../components/ui';
import { PERFIS, listarContas, type Conta } from '../lib/contas';
import { DIAS_AVISO } from '../lib/empresas';
import { listarOrgaos, type Orgao } from '../lib/orgaos';

/**
 * Parâmetros que o sistema usa de fato, e onde cada um mora. Ficam fixos em
 * código ou nas migrações do banco porque vêm da Resolução: um número mudado
 * só na tela deixaria as regras do banco discordando dela. Por isso esta
 * página mostra, não edita.
 */
const PARAMETROS: { rotulo: string; valor: string; onde: string }[] = [
  { rotulo: 'Aviso de documento a vencer', valor: `${DIAS_AVISO} dias antes da validade`, onde: 'Código (DIAS_AVISO)' },
  { rotulo: 'Inscrição sem decisão', valor: 'aparece como pendente depois de 15 dias do requerimento', onde: 'Banco (dashboard_analises_pendentes), art. 7º' },
  { rotulo: 'Prazo de saneamento', valor: '30 dias a partir da notificação', onde: 'Banco (dashboard_saneamentos_vencimento), art. 8º, § 1º' },
  { rotulo: 'Validade da inscrição', valor: '12 meses', onde: 'Banco, art. 7º, § 1º' },
  { rotulo: 'Garantia da recomposição do pavimento', valor: '24 meses a partir da recomposição', onde: 'Banco (conflitos_de_licenca), art. 26' },
  { rotulo: 'Conflito entre obras', valor: 'trechos a até 15 metros', onde: 'Banco (conflitos_de_licenca)' },
];

/** Configurações na Administração: perfis, órgãos e parâmetros. Só o que existe e vale de verdade. */
export default function AdminConfiguracoes() {
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [orgaos, setOrgaos] = useState<Orgao[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([listarContas(), listarOrgaos()])
      .then(([c, o]) => { setContas(c); setOrgaos(o); })
      .catch(setErro);
  }, []);

  if (!contas && !erro) return <Spinner />;
  if (!contas || !orgaos) return <ErrorNote error={erro} />;

  const ativos = contas.filter((c) => c.papel && c.ativo);
  const administradores = ativos.filter((c) => c.administrador).length;

  return (
    <div className="flex flex-col gap-10">
      <Card title="Perfis de acesso" semPadding>
        <p className="border-b border-tinta-100 px-4 py-3 text-sm text-tinta-500">
          O perfil decide o que a pessoa faz no cadastro, e o banco aplica a mesma regra a cada leitura e gravação.
          Perfil e administração mudam em <Link to="/admin" className={linkTexto}>Contas e acessos</Link>.
        </p>
        <div className={tabela.moldura}>
          <table className={tabela.tabela}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.th}>Perfil</th>
                <th className={tabela.th}>O que faz</th>
                <th className={tabela.th}>Duas etapas</th>
                <th className={`${tabela.th} text-right`}>Contas ativas</th>
              </tr>
            </thead>
            <tbody>
              {PERFIS.map((p) => (
                <tr key={p.valor} className={tabela.linha}>
                  <td className={`${tabela.td} font-medium text-tinta-900`}>{p.rotulo}</td>
                  <td className={tabela.td}>{p.descricao}</td>
                  <td className={tabela.td}>{p.valor === 'cisp' ? 'não exigida' : 'exigida'}</td>
                  <td className={`${tabela.td} tabular text-right`}>{ativos.filter((c) => c.papel === p.valor).length}</td>
                </tr>
              ))}
              <tr className={tabela.linha}>
                <td className={`${tabela.td} font-medium text-tinta-900`}>Administrador</td>
                <td className={tabela.td}>perfil SECONSER que também gerencia contas, empresas e auditoria</td>
                <td className={tabela.td}>exigida</td>
                <td className={`${tabela.td} tabular text-right`}>{administradores}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Órgãos públicos contratantes">
        <p className="text-sm text-tinta-700">
          {orgaos.length === 0 ? 'Nenhum órgão cadastrado.' : <><strong>{orgaos.length}</strong> órgão{orgaos.length === 1 ? '' : 's'} cadastrado{orgaos.length === 1 ? '' : 's'}.</>}{' '}
          Cadastro, edição e setores em <Link to="/orgaos" className={linkTexto}>Órgãos</Link>.
        </p>
      </Card>

      <Card title="Prazos e parâmetros" semPadding>
        <p className="border-b border-tinta-100 px-4 py-3 text-sm text-tinta-500">
          Estes valores vêm da Resolução e ficam fixos no código ou nas regras do banco, por isso aparecem aqui só para consulta.
          Mudar um deles é uma alteração versionada do sistema, não um campo de tela.
        </p>
        <div className={tabela.moldura}>
          <table className={tabela.tabela}>
            <tbody>
              {PARAMETROS.map((p) => (
                <tr key={p.rotulo} className={tabela.linha}>
                  <td className={`${tabela.td} font-medium text-tinta-900`}>{p.rotulo}</td>
                  <td className={tabela.td}>{p.valor}</td>
                  <td className={`${tabela.td} text-xs text-tinta-500`}>{p.onde}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="max-w-3xl text-sm text-tinta-500">
        Categorias de empresa, setores e tipos de obra também não são editáveis aqui: são restrições do modelo de dados,
        e o banco recusaria um valor que a tela aceitasse. Incluir um novo exige uma migração.
      </p>
    </div>
  );
}
