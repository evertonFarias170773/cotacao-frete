const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export function formatCurrency(value: number): string {
  return brl.format(value);
}

export function formatKg(value: number): string {
  return `${decimal.format(value)} kg`;
}

export function formatDeliveryRange(min?: number, max?: number): string {
  const lo = min ?? max;
  const hi = max ?? min;
  if (lo === undefined || hi === undefined) return "Prazo não informado";
  if (lo === hi) return lo === 1 ? "1 dia útil" : `${lo} dias úteis`;
  return `${lo} a ${hi} dias úteis`;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Masks a CEP as 00000-000, tolerating partial input while typing. */
export function formatCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Parses a user-typed decimal. Accepts "10,5", "10.5", "1.250,00" and "1,250.00".
 * Returns null when the text is empty or not a number.
 */
export function parseDecimal(input: string): number | null {
  const text = input.trim();
  if (!text) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // The separator that appears last is the decimal one; the other marks thousands.
    normalized =
      lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = text.replace(",", ".");
  } else {
    normalized = text;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Número no padrão pt-BR, sem zeros à direita (21.6 -> "21,6", 36 -> "36"). */
export function formatNumber(value: number): string {
  return decimal.format(value);
}
