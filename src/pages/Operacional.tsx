import { ListaCadastro, type Campo } from '../components/ListaCadastro';
import { formatCpf, isValidCpf, onlyDigits } from '../lib/cnpj';
import type { Empresa } from '../lib/empresas';

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
},
  { chave: 'registro_uf', rotulo: 'UF do registro', tipo: 'opcoes', opcoes: UF_OPCOES },
  { chave: 'art_rrt_numero', rotulo: 'ART/RRT de cargo ou função' },
  { chave: 'telefone', rotulo: 'Telefone' },
  { chave: 'email', rotulo: 'E-mail' },
];

const Linha = ({ titulo, detalhe }: { titulo: React.ReactNode; detalhe: React.ReactNode }) => (
  <>
    <div className="font-medium text-tinta-800">{titulo}</div>
    <div className="text-xs text-tinta-500">{detalhe}</div>
  </>
);

export function Operacional({
  empresa, podeEditar,
}: { empresa: Empresa; podeEditar: boolean }) {
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
              CPF {formatCpf(String(r.cpf))}, {String(r.conselho)} {String(r.registro_numero)}
              {r.registro_uf ? `/${r.registro_uf}` : ''}
              {r.art_rrt_numero ? `, ART/RRT ${r.art_rrt_numero}` : ', sem ART/RRT'}
              {r.telefone ? `, ${r.telefone}` : ''}
            </>}
          />
        )}
      />
    </>
  );
}
