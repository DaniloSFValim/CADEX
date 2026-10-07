/**
 * Consulta de CEP nos dados abertos dos Correios (ViaCEP), direto do
 * navegador. Preenche o endereço do trecho; as coordenadas continuam
 * sendo informadas à mão (o CEP não tem latitude/longitude).
 */
export interface EnderecoCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/** Máscara 00000-000 enquanto digita. */
export function formatCep(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** 8 dígitos. */
export const cepValido = (cep: string) => cep.replace(/\D/g, '').length === 8;

/**
 * Devolve o endereço do CEP, ou null se o CEP não existir. Lança só em
 * falha de rede. Não valida se o CEP é de Niterói — isso fica a cargo do
 * servidor que confere o logradouro e as coordenadas.
 */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const digitos = cep.replace(/\D/g, '');
  if (digitos.length !== 8) return null;
  const resp = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
  if (!resp.ok) throw new Error('Não foi possível consultar o CEP agora.');
  const d = (await resp.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
  if (d.erro) return null;
  return { logradouro: d.logradouro ?? '', bairro: d.bairro ?? '', cidade: d.localidade ?? '', uf: d.uf ?? '' };
}
