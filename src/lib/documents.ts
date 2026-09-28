/** CPF and CNPJ check digits, including the alphanumeric CNPJ (Receita Federal, from July 2026). */

export function normalizeDocument(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeDocument(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = [...cpf].map(Number);
  const check = (length: number) => {
    const sum = digits.slice(0, length).reduce((acc, digit, i) => acc + digit * (length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === digits[9] && check(10) === digits[10];
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  // Each character is worth its ASCII code minus 48: digits keep their value, "A" is 17.
  const values = [...cnpj].map((char) => char.charCodeAt(0) - 48);
  const check = (length: number) => {
    let weight = 2;
    let sum = 0;
    for (let i = length - 1; i >= 0; i--) {
      sum += values[i] * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === values[12] && check(13) === values[13];
}

export function documentKind(value: string): "cpf" | "cnpj" | null {
  if (isValidCpf(value)) return "cpf";
  if (isValidCnpj(value)) return "cnpj";
  return null;
}
