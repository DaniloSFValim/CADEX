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
