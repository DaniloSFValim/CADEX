/**
 * Máscara do telefone enquanto se digita: (21) 9999-9999 ou (21) 99999-9999.
 * Só mexe no que está sendo digitado; valores já gravados não passam por aqui.
 */
export function formatTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  if (digitos.length === 0) return '';
  if (digitos.length <= 2) return `(${digitos}`;
  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  // Com 11 dígitos, o celular tem um 9 a mais na frente; com menos, o corte é 4 + 4.
  const corte = digitos.length > 10 ? 5 : 4;
  if (resto.length <= corte) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}
