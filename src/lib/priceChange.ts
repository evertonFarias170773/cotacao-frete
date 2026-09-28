import { formatCurrency } from "./format";

const toCents = (value: number) => Math.round(value * 100);

/** A warning for the review step when the cart price differs from the quote, or null when it matches. */
export function priceChangeMessage(quoted: number, confirmed: number): string | null {
  if (toCents(quoted) === toCents(confirmed)) return null;
  return `O preço mudou de ${formatCurrency(quoted)} na cotação para ${formatCurrency(confirmed)} no carrinho.`;
}
