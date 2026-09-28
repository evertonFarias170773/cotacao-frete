import type { OriginId } from "./origins";

/**
 * Carriers whose packages are dropped at an agency, by Melhor Envio company id:
 * Jadlog (2), LATAM Cargo (6), Total Express (8), Azul Cargo (9), Buslog (12).
 */
export const AGENCY_COMPANIES: ReadonlySet<number> = new Set([2, 6, 8, 9, 12]);

/**
 * Default agency per origin and carrier, taken from the account's shipment history (Sept 2026).
 * Each origin gets the used agency closest to it; the contract screen lets the team pick another.
 */
const PREFERRED: Record<OriginId, Partial<Record<number, number>>> = {
  poa: {
    9: 5677, // Azul Cargo QNS02, Av. Getúlio Vargas 2575, Canoas
    12: 13154, // Buslog Porto Alegre, R. Voluntários da Pátria 1220
  },
  scs: {
    9: 5692, // Azul Cargo CSUF1, R. Vinte e Oito de Setembro 975, Santa Cruz do Sul
    2: 214, // Jadlog CO Santa Cruz do Sul 02, R. José do Patrocínio 42
  },
};

export function preferredAgency(origin: OriginId, companyId: number): number | undefined {
  return PREFERRED[origin][companyId];
}
