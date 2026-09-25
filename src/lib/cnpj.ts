export const onlyDigits = (s: string): string => (s ?? '').replace(/\D/g, '');

export function isValidCnpj(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;

  const check = (len: number): number => {
    let pos = len - 7;
    let sum = 0;
    for (let i = len; i >= 1; i--) {
      sum += Number(d[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

/** Formata progressivamente enquanto a pessoa digita: 00.000.000/0000-00. */
export function formatCnpj(input: string): string {
  const d = onlyDigits(input).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function isValidCpf(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function formatCpf(input: string): string {
  return onlyDigits(input).slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). */
export const isValidPlaca = (p: string) =>
  /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test((p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
