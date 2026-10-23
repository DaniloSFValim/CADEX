import type { Empresa } from '../../src/lib/empresas';
import type { LicencaComTrechos } from '../../src/lib/licencas';

/** Id no formato de UUID, estável e legível: uuid(7) → 00000000-0000-4000-8000-000000000007. */
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Data de hoje mais n dias (a aplicação usa a data real; os dados de teste andam junto). */
export const dia = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

export function empresa(id: string, razao: string, tipo: Empresa['tipo'], extra: Partial<Empresa> = {}): Empresa {
  return {
    id, codigo_cadex: id.toUpperCase(), cnpj: '00000000000191', razao_social: razao, nome_fantasia: null, tipo,
    setores: ['telecom'], email: 'x@y.z', telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
    bairro: null, cidade: null, uf: null, observacoes: null, representante: null, situacao: 'deferida',
    processo_numero: null, data_requerimento: null, portaria_numero: null, portaria_data: null, validade_ate: '2099-12-31',
    notificacao_data: null, logo_arquivo: null, ativa: true, executa_obras: false,
    criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-01T00:00:00Z', ...extra,
  } as Empresa;
}

let seq = 100;
export function licenca(o: Partial<LicencaComTrechos> = {}): LicencaComTrechos {
  seq += 1;
  return {
    id: uuid(seq), setor: 'telecom', processo_sei: `NIT-050120/${String(seq).padStart(6, '0')}/2026`, numero: `${seq}/2026`,
    tipos_obra: ['vala'], escopo: 'Obra', executora_id: 'ter1', contratante_id: 'op1',
    executora_razao_social: null, executora_cnpj: null, contratante_razao_social: null, contratante_cnpj: null,
    contratante_cpf: null, imovel_endereco: null, processo_urbanismo: null, anterior_resolucao: false, subcontratada_id: null,
    responsavel_tecnico_id: null, art_numero: null, protocolo_data: dia(-120), situacao: 'deferida', decisao_data: dia(-100),
    inicio_previsto: dia(-10), fim_previsto: dia(20), validade_ate: o.fim_previsto !== undefined ? o.fim_previsto : dia(20), orgao_contratante_id: null, concluida_em: null,
    recomposicao_data: null, as_built_sei: null, as_built_data: null, observacoes: null,
    tipo_intervencao: 'obra', origem_intervencao: 'concessionaria', contrato_numero: null, processo_administrativo: null,
    ordem_servico_numero: null, objeto_contrato: null, excluida_em: null, excluida_por: null, excluida_motivo: null, empresas_no_deferimento: null, codigo_publico: `c${seq}`,
    criado_em: `${dia(-seq % 90)}T10:00:00Z`, atualizado_em: `${dia(-1)}T10:00:00Z`,
    licenca_trechos: [{ id: uuid(5000 + seq), ordem: 1, logradouro: 'Rua A', bairro: null, referencia: null,
      inicio_lat: -22.9, inicio_lng: -43.1, fim_lat: null, fim_lng: null }],
    ...o,
  } as LicencaComTrechos;
}

/** Empresas-padrão dos testes: duas operadoras, uma terceirizada e uma operadora inapta. */
export const empresasPadrao = () => [
  empresa('op1', 'Operadora Um S.A.', 'operadora', { nome_fantasia: 'OpUm', cnpj: '33000167000101', executa_obras: true }),
  empresa('op2', 'Operadora Dois S.A.', 'operadora', { cnpj: '44000167000101', executa_obras: true }),
  empresa('op3', 'Operadora Três S.A.', 'operadora', { nome_fantasia: 'OpTres', cnpj: '55000167000101' }),
  empresa('ter1', 'Terceirizada Alfa Ltda.', 'terceirizada', { cnpj: '55000167000101' }),
  empresa('inap', 'Operadora Inapta S.A.', 'operadora', { cnpj: '66000167000101', situacao: 'inapta', validade_ate: null }),
];
