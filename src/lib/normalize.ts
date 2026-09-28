import { z } from "zod";
import type { QuoteOption, QuoteResult } from "./types";

/** Melhor Envio sends prices as strings ("25.50"); tolerate numbers and blanks too. */
const money = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "string" && v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

const days = z.coerce.number().nullish();

const range = z
  .object({ min: days, max: days })
  .nullish();

/** Loose on purpose: unknown fields pass through so an API change does not break parsing. */
const serviceSchema = z.looseObject({
  id: z.coerce.number().optional(),
  name: z.string().nullish(),
  price: money,
  custom_price: money,
  discount: money,
  delivery_time: days,
  delivery_range: range,
  custom_delivery_time: days,
  custom_delivery_range: range,
  packages: z.array(z.unknown()).nullish(),
  company: z
    .looseObject({ id: z.coerce.number().nullish(), name: z.string().nullish(), picture: z.string().nullish() })
    .nullish(),
  error: z.string().nullish(),
});

export const quoteResponseSchema = z.array(serviceSchema);

type Service = z.output<typeof serviceSchema>;

function delivery(s: Service): { min?: number; max?: number } {
  const custom = s.custom_delivery_range;
  if (custom && (custom.min != null || custom.max != null)) {
    return { min: custom.min ?? custom.max ?? undefined, max: custom.max ?? custom.min ?? undefined };
  }
  if (s.custom_delivery_time != null) {
    return { min: s.custom_delivery_time, max: s.custom_delivery_time };
  }
  const plain = s.delivery_range;
  if (plain && (plain.min != null || plain.max != null)) {
    return { min: plain.min ?? plain.max ?? undefined, max: plain.max ?? plain.min ?? undefined };
  }
  if (s.delivery_time != null) {
    return { min: s.delivery_time, max: s.delivery_time };
  }
  return {};
}

const worstCase = (o: QuoteOption) => o.deliveryMax ?? o.deliveryMin ?? Number.POSITIVE_INFINITY;

export function normalizeQuoteResponse(raw: unknown): QuoteResult {
  const services = quoteResponseSchema.parse(raw);
  const result: QuoteResult = { available: [], unavailable: [] };

  services.forEach((s, index) => {
    const name = s.name ?? `Serviço ${s.id ?? index + 1}`;
    const company = s.company?.name ?? "";
    const price = s.custom_price ?? s.price;

    if (s.error) {
      result.unavailable.push({ name, company, reason: s.error });
      return;
    }
    if (price === undefined) {
      result.unavailable.push({ name, company, reason: "Preço não informado" });
      return;
    }

    const { min, max } = delivery(s);
    const option: QuoteOption = {
      id: s.id ?? -(index + 1),
      service: name,
      company,
      price,
    };
    if (s.company?.picture) option.logoUrl = s.company.picture;
    if (s.company?.id != null && Number.isFinite(s.company.id)) option.companyId = s.company.id;
    if (s.price !== undefined && s.price !== price) option.originalPrice = s.price;
    if (min !== undefined) option.deliveryMin = min;
    if (max !== undefined) option.deliveryMax = max;
    if (s.packages) option.packages = s.packages;
    result.available.push(option);
  });

  result.available.sort(
    (a, b) =>
      a.price - b.price ||
      worstCase(a) - worstCase(b) ||
      (a.deliveryMin ?? Number.POSITIVE_INFINITY) - (b.deliveryMin ?? Number.POSITIVE_INFINITY),
  );
  return result;
}

/** The first item is always the cheapest; "fastest" only when a different item beats it on delivery. */
export function pickBadges(available: QuoteOption[]): { cheapestId?: number; fastestId?: number } {
  if (available.length === 0) return { cheapestId: undefined, fastestId: undefined };
  const cheapest = available[0];
  let fastest = cheapest;
  for (const option of available) {
    if (worstCase(option) < worstCase(fastest)) fastest = option;
  }
  return { cheapestId: cheapest.id, fastestId: fastest.id === cheapest.id ? undefined : fastest.id };
}
