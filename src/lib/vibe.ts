import { z } from "zod";
import { TRIBAND } from "@/config/products";
import { normalizeDocument } from "./documents";
import { QuoteError } from "./errors";
import { formatCep, onlyDigits, parseDecimal } from "./format";
import type { NfeData } from "./nfeXml";
import type { PlannedVolume } from "./presets";
import type { RecipientInput } from "./recipient";

/** Orders from the Vibe always leave from Porto Alegre. */
export const VIBE_ORIGIN = "poa" as const;

export const NOT_WEIGHED = "Esse pedido ainda não foi pesado no despacho.";
export const NO_POSTAL_CODE = "O pedido no Vibe não tem um CEP de entrega válido.";
export const INVOICE_WITHOUT_POSTAL_CODE = "A nota não tem um CEP de entrega válido.";

/** The quote form holds at most 20 volume lines of at most 50 identical boxes each. */
const MAX_LINES = 20;
const MAX_PER_LINE = 50;
const MAX_BOXES = MAX_LINES * MAX_PER_LINE;

export const TOO_MANY_BOXES = `O pedido tem caixas demais para uma cotação (máximo de ${MAX_BOXES}).`;

/**
 * Every order leaves in the same box: the Triband base, with the height growing with the weight.
 * The Triband numbers per unit are the same numbers per kg (2.4 cm and R$ 135).
 */
const BOX = { width: TRIBAND.width, length: TRIBAND.length, heightPerKg: TRIBAND.unitHeight, valuePerKg: TRIBAND.unitPrice };

export type BoxPlan = Omit<PlannedVolume, "unitsPerVolume">;

export type VibeOrder = {
  id: number;
  recipient: RecipientInput;
  /** Delivery CEP, 8 digits. */
  postalCode: string;
  /** Weighed at dispatch, in kg. */
  totalWeight: number;
  boxes: BoxPlan[];
};

/** An NF-e XML read on the device, kept with its text because Azul Cargo needs it. */
export type LoadedNfe = { nfe: NfeData; xml: string };

/** The Vibe order loaded on the quote screen, and the invoice attached to it, if any. */
export type VibeSelection = { order: VibeOrder; invoice: LoadedNfe | null };

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

/** The Vibe sends null for missing data; the app works with empty strings. */
const text = z
  .string()
  .nullish()
  .transform((value) => value?.trim() ?? "");

/** Numbers may come as numbers or as text with a dot or a comma. */
const decimal = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) =>
    value === null || value === undefined ? null : typeof value === "number" ? value : parseDecimal(value),
  );

const addressSchema = z.looseObject({
  cep: text,
  logradouro: text,
  numero: text,
  complemento: text,
  bairro: text,
  cidade: text,
  uf: text,
});

/** The parts of GET /pedidos/{id_int} the app reads. Everything else is ignored. */
export const vibeResponseSchema = z.looseObject({
  id_int: z.coerce.number().int().positive(),
  entrega: z.looseObject({
    destinatario: z.looseObject({ nome: text, documento: text, email: text, telefone: text }),
    endereco: addressSchema,
  }),
  peso_aferido_kg: decimal,
  volumes: z
    .looseObject({
      quantidade: decimal,
      lista: z.array(z.looseObject({ peso_kg: decimal })).nullish(),
    })
    .nullish(),
});

export type VibeResponse = z.output<typeof vibeResponseSchema>;

function box(weight: number, quantity: number): BoxPlan {
  return {
    quantity,
    width: BOX.width,
    length: BOX.length,
    weight: round(weight, 3),
    height: round(weight * BOX.heightPerKg, 2),
    insurance: round(weight * BOX.valuePerKg, 2),
  };
}

/** Groups consecutive equal weights into form lines of at most 50 boxes. */
function group(weights: number[]): BoxPlan[] {
  const plan: BoxPlan[] = [];
  for (const weight of weights) {
    const previous = plan[plan.length - 1];
    if (previous && previous.weight === round(weight, 3) && previous.quantity < MAX_PER_LINE) previous.quantity += 1;
    else plan.push(box(weight, 1));
  }
  return plan;
}

/**
 * The boxes of an order, from its weight: each box's own weight when the Vibe has all of them,
 * otherwise the weighed total split equally. Empty when there is no weight at all.
 */
export function boxesFromWeight(totalWeight: number | null, count: number | null, perBox: (number | null)[]): BoxPlan[] {
  const boxes = Math.max(1, Math.trunc(count ?? 1));
  const known = perBox.length === boxes && perBox.every((weight) => weight !== null && weight > 0);
  const total = known ? perBox.reduce<number>((sum, weight) => sum + (weight ?? 0), 0) : (totalWeight ?? 0);
  if (!(total > 0)) return [];

  const equalSplit = () => group(Array.from({ length: boxes }, () => round(total / boxes, 3)));
  if (!known) return equalSplit();
  const plan = group(perBox as number[]);
  return plan.length > MAX_LINES ? equalSplit() : plan;
}

/** The reduced view of an order that goes to the browser. */
export function toVibeOrder(response: VibeResponse): VibeOrder {
  // Checked before building the boxes: a typo in the Vibe must not become a huge array.
  if (Math.trunc(response.volumes?.quantidade ?? 1) > MAX_BOXES) throw new QuoteError(422, TOO_MANY_BOXES);
  const perBox = response.volumes?.lista?.map((item) => item.peso_kg) ?? [];
  const boxes = boxesFromWeight(response.peso_aferido_kg, response.volumes?.quantidade ?? null, perBox);
  if (boxes.length === 0) throw new QuoteError(422, NOT_WEIGHED);

  const address = response.entrega.endereco;
  const postalCode = onlyDigits(address.cep);
  if (postalCode.length !== 8) throw new QuoteError(422, NO_POSTAL_CODE);

  const person = response.entrega.destinatario;
  return {
    id: response.id_int,
    postalCode,
    totalWeight: round(boxes.reduce((sum, item) => sum + item.weight * item.quantity, 0), 3),
    recipient: {
      name: person.nome,
      document: normalizeDocument(person.documento),
      phone: onlyDigits(person.telefone),
      email: person.email,
      address: address.logradouro,
      number: address.numero,
      complement: address.complemento,
      district: address.bairro,
      city: address.cidade,
      stateAbbr: address.uf.toUpperCase(),
    },
    boxes,
  };
}

/** The delivery CEP is optional in the NF-e layout; without it the invoice cannot set the quoted CEP. */
export function hasDeliveryPostalCode(nfe: NfeData): boolean {
  return /^\d{8}$/.test(nfe.recipient.postalCode);
}

/** Names compare without case, accents or repeated spaces ("CLIENTE FICTÍCIO" = "Cliente Ficticio"). */
const comparableName = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Differences between the invoice and the order. They only warn: the invoice always wins. */
export function compareNfeWithVibe(nfe: NfeData, order: VibeOrder): string[] {
  const warnings: string[] = [];
  const invoice = nfe.recipient;
  if (invoice.postalCode !== order.postalCode) {
    warnings.push(
      `O CEP da nota (${formatCep(invoice.postalCode)}) é diferente do CEP do pedido ${order.id} (${formatCep(order.postalCode)}). A cotação usa o CEP da nota.`,
    );
  }
  if (comparableName(invoice.name) !== comparableName(order.recipient.name)) {
    warnings.push(
      `O destinatário da nota (${invoice.name}) é diferente do cliente do pedido ${order.id} (${order.recipient.name}). A etiqueta usa o da nota.`,
    );
  }
  if (order.recipient.document && normalizeDocument(invoice.document) !== normalizeDocument(order.recipient.document)) {
    warnings.push(`O CPF/CNPJ do destinatário da nota é diferente do cadastrado no pedido ${order.id}. A etiqueta usa o da nota.`);
  }
  return warnings;
}
