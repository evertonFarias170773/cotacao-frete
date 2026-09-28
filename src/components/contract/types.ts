import type { RecipientInput } from "@/lib/recipient";

export type ContentDraft = { kind: "declaration"; description: string } | { kind: "invoice"; key: string };

export type CartOrder = { id: string; protocol: string; price: number };
export type CartResult = { orders: CartOrder[]; total: number };

export type ContractDraft = {
  recipient: RecipientInput;
  content: ContentDraft;
  agencyId?: number;
  agencyName?: string;
};

export const EMPTY_RECIPIENT: RecipientInput = {
  name: "",
  document: "",
  phone: "",
  email: "",
  address: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  stateAbbr: "",
};

/** The team's most common declared content (account history, Sept 2026). */
export const DEFAULT_DESCRIPTION = "Pulseira Tri Band";

/** Non-commercial shipments above this insured value are refused by some carriers (Jadlog, E-CRT-0001). */
export const DECLARATION_INSURANCE_LIMIT = 1000;
