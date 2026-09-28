import { formatCep, formatCurrency } from "./format";
import type { NfeData } from "./nfeXml";

const toCents = (value: number) => Math.round(value * 100);

/**
 * Compares an NF-e with the quote on screen. A different CEP blocks (the quoted price would not
 * apply to that address); a different value only warns. The issuer check runs on the server,
 * which is where the sender's CNPJ lives.
 */
export function compareNfeWithQuote(
  nfe: NfeData,
  quote: { destinationCep: string; declaredValue: number },
): { blocking: string | null; warnings: string[] } {
  if (nfe.recipient.postalCode !== quote.destinationCep) {
    return {
      blocking: `O CEP da nota (${formatCep(nfe.recipient.postalCode)}) é diferente do CEP cotado (${formatCep(quote.destinationCep)}). Faça uma nova cotação para o CEP da nota.`,
      warnings: [],
    };
  }
  const warnings = [...nfe.warnings];
  if (toCents(nfe.totalValue) !== toCents(quote.declaredValue)) {
    warnings.push(
      `O valor da nota (${formatCurrency(nfe.totalValue)}) é diferente do valor declarado na cotação (${formatCurrency(quote.declaredValue)}). O seguro usa o valor da cotação.`,
    );
  }
  return { blocking: null, warnings };
}
