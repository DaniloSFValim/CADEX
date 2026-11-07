import { supabase } from './supabase';

/** Licença na visão simplificada da empresa (view empresa_licencas): só leitura, sem dados contratuais. */
export interface LicencaEmpresa {
  id: string;
  numero: string | null;
  escopo: string;
  setor: string;
  tipo_intervencao: string;
  situacao: string;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  validade_ate: string | null;
  executa: boolean;
  contrata: boolean;
}

/** Dados da própria empresa que o portal mostra. O banco devolve só a linha do representante. */
export interface CadastroEmpresa {
  id: string;
  razao_social: string;
  cnpj: string;
  codigo_cadex: string;
  ativa: boolean;
}

/** Cadastro da própria empresa, em colunas simplificadas. */
export async function buscarMinhaEmpresa(): Promise<CadastroEmpresa | null> {
  const { data, error } = await supabase
    .from('empresas').select('id, razao_social, cnpj, codigo_cadex, ativa').maybeSingle();
  if (error) throw error;
  return (data as CadastroEmpresa | null) ?? null;
}

export async function listarLicencasDaEmpresa(): Promise<LicencaEmpresa[]> {
  const { data, error } = await supabase.from('empresa_licencas').select('*').order('inicio_previsto', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LicencaEmpresa[];
}
