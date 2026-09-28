import { z } from "zod";
import type { Party } from "./cart";
import { documentKind, normalizeDocument } from "./documents";
import { onlyDigits } from "./format";
import { isValidNfeKey } from "./nfe";
import { quoteRequestSchema } from "./schemas";

/** Recipient as typed in the contract screen. The CEP is not here: it is the quoted destination. */
export const recipientSchema = z.object({
  name: z.string().trim().min(3, { error: "Informe o nome completo." }),
  document: z
    .string()
    .trim()
    .refine((value) => documentKind(value) !== null, { error: "CPF ou CNPJ inválido." }),
  phone: z
    .string()
    .transform(onlyDigits)
    .pipe(z.string().regex(/^\d{10,11}$/, { error: "Informe o telefone com DDD." })),
  email: z
    .union([z.literal(""), z.email({ error: "E-mail inválido." })])
    .optional(),
  address: z.string().trim().min(2, { error: "Informe a rua." }),
  number: z.string().trim().min(1, { error: "Informe o número." }),
  complement: z.string().trim().max(60, { error: "Complemento muito longo." }).optional(),
  district: z.string().trim().min(2, { error: "Informe o bairro." }),
  city: z.string().trim().min(2, { error: "Informe a cidade." }),
  stateAbbr: z
    .string()
    .trim()
    .length(2, { error: "Informe a UF." })
    .transform((value) => value.toUpperCase()),
});

export type Recipient = z.output<typeof recipientSchema>;
export type RecipientInput = z.input<typeof recipientSchema>;

export const contentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("declaration"), description: z.string().trim().min(3, { error: "Descreva o conteúdo." }) }),
  z.object({
    kind: z.literal("invoice"),
    key: z.string().refine(isValidNfeKey, { error: "Chave da NF-e inválida." }),
  }),
]);

/** What the browser sends to put an accepted quote in the Melhor Envio cart. */
export const contractRequestSchema = z.object({
  quote: quoteRequestSchema,
  serviceId: z.number().int().positive(),
  recipient: recipientSchema,
  content: contentSchema,
  agencyId: z.number().int().positive().optional(),
});

export type ContractRequest = z.output<typeof contractRequestSchema>;

export function toRecipientParty(recipient: Recipient, postalCode: string): Party {
  const party: Party = {
    name: recipient.name,
    phone: recipient.phone,
    address: recipient.address,
    number: recipient.number,
    district: recipient.district,
    city: recipient.city,
    postalCode,
    stateAbbr: recipient.stateAbbr,
  };
  if (recipient.email) party.email = recipient.email;
  if (recipient.complement) party.complement = recipient.complement;
  if (documentKind(recipient.document) === "cnpj") party.companyDocument = recipient.document;
  else party.document = recipient.document;
  return party;
}

export const SAME_DOCUMENT_MESSAGE =
  "Remetente e destinatário têm o mesmo CNPJ. Algumas transportadoras não aceitam transferência entre unidades.";

/** Services known to refuse the same document on both ends (Total Express rule "different:from.company_document"). */
const REFUSES_SAME_DOCUMENT: ReadonlySet<number> = new Set([35]);

/** A reason this service cannot be contracted for these parties, or null. Checked before calling the API. */
export function contractBlockReason(serviceId: number, sender: Party, recipient: Party): string | null {
  if (!REFUSES_SAME_DOCUMENT.has(serviceId)) return null;
  const senderDocument = normalizeDocument(sender.companyDocument ?? sender.document ?? "");
  const recipientDocument = normalizeDocument(recipient.companyDocument ?? recipient.document ?? "");
  return senderDocument && senderDocument === recipientDocument ? SAME_DOCUMENT_MESSAGE : null;
}
