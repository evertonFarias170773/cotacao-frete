export type QuoteOption = {
  id: number;
  service: string;
  company: string;
  /** Melhor Envio carrier id (1 Correios, 2 Jadlog, 9 Azul Cargo...). */
  companyId?: number;
  logoUrl?: string;
  /** Price to display (custom_price, falling back to price). */
  price: number;
  /** Original price, only when it differs from `price`. */
  originalPrice?: number;
  deliveryMin?: number;
  deliveryMax?: number;
  packages?: unknown[];
};

export type UnavailableOption = {
  name: string;
  company: string;
  reason: string;
};

export type QuoteResult = {
  /** Sorted by price ascending, ties broken by the shortest delivery. */
  available: QuoteOption[];
  unavailable: UnavailableOption[];
};
