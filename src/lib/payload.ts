import { getOrigin } from "@/config/origins";
import type { QuoteRequest, Volume } from "./schemas";

export type ApiVolume = {
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance: number;
};

export type ApiProduct = {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
  quantity: 1;
};

type PayloadBase = {
  from: { postal_code: string };
  to: { postal_code: string };
  options: { receipt: boolean; own_hand: boolean };
};

export type VolumesPayload = PayloadBase & { volumes: ApiVolume[] };
export type ProductsPayload = PayloadBase & { products: ApiProduct[] };

/** Repeats each volume `quantity` times so the API receives one entry per physical package. */
export function expandVolumes(volumes: Volume[]): Omit<Volume, "quantity">[] {
  return volumes.flatMap(({ quantity, ...volume }) =>
    Array.from({ length: quantity }, () => ({ ...volume })),
  );
}

function base(request: QuoteRequest): PayloadBase {
  return {
    from: { postal_code: getOrigin(request.originId).cep },
    to: { postal_code: request.destinationCep },
    options: { receipt: request.options.receipt, own_hand: request.options.own_hand },
  };
}

/** Preferred mode: packages already assembled. */
export function buildVolumesPayload(request: QuoteRequest): VolumesPayload {
  return {
    ...base(request),
    volumes: expandVolumes(request.volumes).map((v) => ({
      width: v.width,
      height: v.height,
      length: v.length,
      weight: v.weight,
      insurance: v.insurance,
    })),
  };
}

/** Plan B: the same packages expressed as `products`, one per package. */
export function buildProductsPayload(request: QuoteRequest): ProductsPayload {
  return {
    ...base(request),
    products: expandVolumes(request.volumes).map((v, index) => ({
      id: String(index + 1),
      width: v.width,
      height: v.height,
      length: v.length,
      weight: v.weight,
      insurance_value: v.insurance,
      quantity: 1,
    })),
  };
}

/** True when a 422 body complains about the `products` field, i.e. the API rejected the volumes mode. */
export function wantsProductsMode(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const { message, errors } = body as { message?: unknown; errors?: unknown };
  if (errors && typeof errors === "object") {
    const keys = Object.keys(errors as Record<string, unknown>);
    if (keys.some((k) => k === "products" || k.startsWith("products."))) return true;
  }
  return typeof message === "string" && /\bproducts\b/i.test(message);
}
