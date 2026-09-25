import { ListaCadastro, type Campo } from '../components/ListaCadastro';
import { dataBR } from '../components/Situacao';
import { formatCpf, isValidCpf, isValidPlaca, onlyDigits } from '../lib/cnpj';
import { hojeISO, nomeEmpresa, type Empresa } from '../lib/empresas';

const UF_OPCOES = ['RJ', 'SP', 'MG', 'ES', 'Outra'].map((u) => ({ valor: u === 'Outra' ? '' : u, rotulo: u }));

// ---------------------------------------------------------------------
// Responsável técnico — art. 6º, II, "a" e "b"
// ---------------------------------------------------------------------
const camposRT: Campo[] = [
  { chave: 'nome', rotulo: 'Nome completo', obrigatorio: true, largura: 2 },
  { chave: 'cpf', rotulo: 'CPF', obrigatorio: true, mascara: formatCpf,
    validar: (v) => (isValidCpf(v) ? null : 'CPF inválido.') },
  { chave: 'conselho', rotulo: 'Conselho profissional', tipo: 'opcoes', obrigatorio: true,
    opcoes: ['CREA', 'CFT', 'CAU', 'CRT', 'Outro'].map((c) => ({ valor: c, rotulo: c })) },
  { chave: 'registro_numero', rotulo: 'Nº do registro no conselho', obrigatorio: true,
    dica: 'Art. 6º, II, "a"' },
  { chave: 'registro_uf', rotulo: 'UF do registro', tipo: 'opcoes', opcoes: UF_OPCOES },
  { chave: 'art_rrt_numero', rotulo: 'Nº da ART/RRT de cargo ou função', dica: 'Art. 6º, II, "b"' },
  { chave: 'telefone', rotulo: 'Telefone' },
  { chave: 'email', rotulo: 'E-mail' },
];

// ---------------------------------------------------------------------
// Pessoal técnico e crachá — arts. 6º, II, "c", 23 e 25
// ---------------------------------------------------------------------
const camposPessoal: Campo[] = [
  { chave: 'nome', rotulo: 'Nome completo', obrigatorio: true, largura: 2, dica: 'Art. 23, II' },
  { chave: 'funcao', rotulo: 'Função ou cargo', obrigatorio: true, dica: 'Art. 23, III' },
  { chave: 'documento_tipo', rotulo: 'Documento oficial', tipo: 'opcoes', obrigatorio: true,
    opcoes: ['RG', 'CPF', 'CNH', 'Outro'].map((c) => ({ valor: c, rotulo: c })) },
  { chave: 'documento_numero', rotulo: 'Nº do documento', obrigatorio: true,
    validar: (v, t) => (t.documento_tipo === 'CPF' && !isValidCpf(v) ? 'CPF inválido.' : null) },
  { chave: 'cracha_validade', rotulo: 'Validade do crachá', tipo: 'data', dica: 'Art. 23, V' },
  { chave: 'telefone', rotulo: 'Telefone de contato', dica: 'Art. 19, § 1º' },
  { chave: 'responsavel_equipe', rotulo: 'Responsável pela equipe em campo (art. 25, § 1º)', tipo: 'marcar', largura: 3 },
];

// ---------------------------------------------------------------------
// Veículos e maquinário — arts. 19, § 1º, e 21
// ---------------------------------------------------------------------
const camposVeiculo = (operadoras: Empresa[]): Campo[] => [
  { chave: 'categoria', rotulo: 'Categoria', tipo: 'opcoes', obrigatorio: true,
    opcoes: [{ valor: 'veiculo', rotulo: 'Veículo' }, { valor: 'maquinario', rotulo: 'Maquinário' }] },
  { chave: 'tipo', rotulo: 'Tipo', obrigatorio: true, dica: 'Ex.: caminhão cesto aéreo, van, munck (art. 19, § 1º)' },
  { chave: 'placa', rotulo: 'Placa', mascara: (v) => v.toUpperCase(),
    obrigatorio: (t) => t.categoria === 'veiculo',
    validar: (v) => (isValidPlaca(v) ? null : 'Placa inválida (ABC1234 ou ABC1D23).') },
  { chave: 'modelo', rotulo: 'Marca/modelo' },
  { chave: 'identificacao_laterais', rotulo: 'Nome da empresa nas duas laterais (art. 21)', tipo: 'marcar', largura: 2 },
  { chave: 'identificacao_traseira', rotulo: 'Nome da concessionária na traseira (art. 21)', tipo: 'marcar', largura: 2 },
  { chave: 'concessionaria_traseira_id', rotulo: 'Concessionária na traseira', tipo: 'opcoes', largura: 2,
    quando: (t) => Boolean(t.identificacao_traseira),
    opcoes: [{ valor: '', rotulo: '—' }, ...operadoras.map((o) => ({ valor: o.id, rotulo: nomeEmpresa(o) }))] },
];

const Linha = ({ titulo, detalhe }: { titulo: React.ReactNode; detalhe: React.ReactNode }) => (
  <>
    <div className="font-medium text-slate-800">{titulo}</div>
    <div className="text-xs text-slate-500">{detalhe}</div>
  </>
);

export function Operacional({
  empresa, operadoras, podeEditar,
}: { empresa: Empresa; operadoras: Empresa[]; podeEditar: boolean }) {
  const porId = new Map(operadoras.map((o) => [o.id, o]));
  const hoje = hojeISO();

  return (
    <>
      <ListaCadastro
        titulo="Responsáveis técnicos"
        tabela="responsaveis_tecnicos"
        empresaId={empresa.id}
        campos={camposRT}
        podeEditar={podeEditar}
        vazioTexto="Nenhum responsável técnico cadastrado."
        preparar={(v) => ({ ...v, cpf: onlyDigits(String(v.cpf ?? '')) })}
        resumo={(r) => (
          <Linha
            titulo={r.nome as string}
            detalhe={<>
              CPF {formatCpf(String(r.cpf))} · {String(r.conselho)} {String(r.registro_numero)}
              {r.registro_uf ? `/${r.registro_uf}` : ''}
              {r.art_rrt_numero ? ` · ART/RRT ${r.art_rrt_numero}` : ' · sem ART/RRT informada'}
              {r.telefone ? ` · ${r.telefone}` : ''}
            </>}
          />
        )}
      />

      <ListaCadastro
        titulo="Pessoal técnico e crachás"
        tabela="funcionarios"
        empresaId={empresa.id}
        campos={camposPessoal}
        podeEditar={podeEditar}
        vazioTexto="Nenhum funcionário cadastrado."
        preparar={(v) => ({
          ...v,
          documento_numero: v.documento_tipo === 'CPF' ? onlyDigits(String(v.documento_numero ?? '')) : v.documento_numero,
        })}
        resumo={(r) => {
          const vencido = r.cracha_validade && String(r.cracha_validade) < hoje;
          return (
            <Linha
              titulo={<>{String(r.nome)}{r.responsavel_equipe && <span className="ml-2 text-xs font-normal text-gov-700">responsável de equipe</span>}</>}
              detalhe={<>
                {String(r.funcao)} · {String(r.documento_tipo)} {String(r.documento_numero)}
                {' · crachá '}
                <span className={vencido ? 'font-medium text-red-700' : ''}>
                  {r.cracha_validade ? `válido até ${dataBR(String(r.cracha_validade))}` : 'sem validade informada'}
                </span>
                {r.telefone ? ` · ${r.telefone}` : ''}
              </>}
            />
          );
        }}
      />

      <ListaCadastro
        titulo="Veículos e maquinário"
        tabela="veiculos"
        empresaId={empresa.id}
        campos={camposVeiculo(operadoras)}
        podeEditar={podeEditar}
        vazioTexto="Nenhum veículo cadastrado."
        preparar={(v) => ({
          ...v,
          placa: v.placa ? String(v.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
          concessionaria_traseira_id: v.identificacao_traseira ? (v.concessionaria_traseira_id || null) : null,
        })}
        resumo={(r) => {
          const traseira = r.concessionaria_traseira_id ? porId.get(String(r.concessionaria_traseira_id)) : undefined;
          const semIdent = !r.identificacao_laterais || !r.identificacao_traseira;
          return (
            <Linha
              titulo={<>
                <span className="font-mono">{r.placa ? String(r.placa) : 'sem placa'}</span>
                {' · '}{String(r.tipo)}{r.modelo ? ` (${r.modelo})` : ''}
              </>}
              detalhe={<>
                {r.categoria === 'maquinario' ? 'Maquinário' : 'Veículo'}
                {' · identificação visual: '}
                <span className={semIdent ? 'font-medium text-amber-800' : ''}>
                  laterais {r.identificacao_laterais ? 'sim' : 'não'}, traseira {r.identificacao_traseira ? 'sim' : 'não'}
                </span>
                {traseira && ` (${nomeEmpresa(traseira)})`}
              </>}
            />
          );
        }}
      />
    </>
  );
}
