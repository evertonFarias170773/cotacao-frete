import "server-only";
import { z } from "zod";
import { preferredAgency } from "@/config/agencies";
import { ORIGINS, type OriginId } from "@/config/origins";
import { SenderConfigError, getSender } from "@/config/senders";
import { CartBuildError, buildCartItems, type Party } from "./cart";
import { QuoteError, mapApiError } from "./errors";
import { meRequest } from "./melhorEnvio";
import { contractBlockReason, toRecipientParty, type ContractRequest } from "./recipient";
import { pixTopUpFor } from "./wallet";

/** Tag on every order the app creates, so the shipments screen can tell them apart. */
export const APP_TAG = "cotador-fretes";

const CART_PATH = "/api/v2/me/cart";
const NO_ANSWER = "O Melhor Envio não respondeu. Tente novamente.";

const isOk = (status: number) => status >= 200 && status < 300;
const round2 = (value: number) => Math.round(value * 100) / 100;

export type CartOrder = { id: string; protocol: string; price: number };
export type CartResult = { orders: CartOrder[]; total: number };

const cartOrderSchema = z.looseObject({
  id: z.string().min(1),
  protocol: z.string().optional(),
  price: z.coerce.number(),
});

function senderFor(origin: OriginId): Party {
  try {
    return getSender(origin);
  } catch (error) {
    if (error instanceof SenderConfigError) throw new QuoteError(500, error.message);
    throw error;
  }
}

/**
 * Puts an accepted quote in the Melhor Envio cart. Carriers that take one volume per item
 * get several items; if any of them fails, the ones already created are removed.
 */
export async function addToCart(contract: ContractRequest): Promise<CartResult> {
  const sender = senderFor(contract.quote.originId);
  const recipient = toRecipientParty(contract.recipient, contract.quote.destinationCep);
  const blocked = contractBlockReason(contract.serviceId, sender, recipient);
  if (blocked) throw new QuoteError(422, blocked);

  let items;
  try {
    items = buildCartItems({
      request: contract.quote,
      serviceId: contract.serviceId,
      sender,
      recipient,
      content: contract.content,
      agencyId: contract.agencyId,
      tag: APP_TAG,
    });
  } catch (error) {
    if (error instanceof CartBuildError) throw new QuoteError(422, error.message);
    throw error;
  }

  const created: CartOrder[] = [];
  try {
    for (const item of items) {
      const response = await meRequest("POST", CART_PATH, item, { timeoutMessage: NO_ANSWER });
      if (!isOk(response.status)) throw mapApiError(response.status, response.body);
      const parsed = cartOrderSchema.safeParse(response.body);
      if (!parsed.success) throw new QuoteError(502, "Resposta inesperada do Melhor Envio ao montar o envio.");
      created.push({ id: parsed.data.id, protocol: parsed.data.protocol ?? "", price: parsed.data.price });
    }
  } catch (error) {
    await removeFromCart(created.map((order) => order.id));
    throw error;
  }

  return { orders: created, total: round2(created.reduce((sum, order) => sum + order.price, 0)) };
}

/** Removes cart items; ones already gone or already paid are ignored. */
export async function removeFromCart(ids: string[]): Promise<void> {
  for (const id of ids) {
    await meRequest("DELETE", `${CART_PATH}/${encodeURIComponent(id)}`).catch(() => undefined);
  }
}

const balanceSchema = z.looseObject({ balance: z.coerce.number() });

/** Money available in the Melhor Envio wallet. */
export async function walletBalance(): Promise<number> {
  const response = await meRequest("GET", "/api/v2/me/balance", undefined, { timeoutMessage: NO_ANSWER });
  if (!isOk(response.status)) throw mapApiError(response.status, response.body);
  const parsed = balanceSchema.safeParse(response.body);
  if (!parsed.success) throw new QuoteError(502, "Resposta inesperada do Melhor Envio ao consultar o saldo.");
  return parsed.data.balance;
}

const cartPageSchema = z.looseObject({
  data: z.array(z.looseObject({ id: z.string(), price: z.coerce.number() })),
  last_page: z.coerce.number().optional(),
});
const MAX_CART_PAGES = 10;

/**
 * Sum of the cart prices of these orders, read from Melhor Envio (never from the browser).
 * Throws 409 when any of them is no longer waiting in the cart.
 */
export async function cartTotal(ids: string[]): Promise<number> {
  const prices = await cartPrices(ids);
  if (!ids.every((id) => prices.has(id))) throw new QuoteError(409, NOT_WAITING);
  return round2(ids.reduce((sum, id) => sum + (prices.get(id) ?? 0), 0));
}

const NOT_WAITING = "Este envio não está mais aguardando pagamento. Confira na tela Envios.";

/** Cart prices of whichever of these orders are still in the cart (unpaid). */
async function cartPrices(ids: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  for (let page = 1; page <= MAX_CART_PAGES; page++) {
    const response = await meRequest("GET", `${CART_PATH}?page=${page}`, undefined, { timeoutMessage: NO_ANSWER });
    if (!isOk(response.status)) throw mapApiError(response.status, response.body);
    // An empty cart comes back as 204 with no body.
    if (response.status === 204 || response.body === null) break;
    const parsed = cartPageSchema.safeParse(response.body);
    if (!parsed.success) throw new QuoteError(502, "Resposta inesperada do Melhor Envio ao ler o carrinho.");
    for (const item of parsed.data.data) prices.set(item.id, item.price);
    if (ids.every((id) => prices.has(id)) || page >= (parsed.data.last_page ?? 1)) break;
  }
  return prices;
}

const orderSchema = z.looseObject({
  id: z.string(),
  status: z.string().nullish(),
  paid_at: z.string().nullish(),
  price: z.coerce.number().nullish(),
  tracking: z.string().nullish(),
  self_tracking: z.string().nullish(),
  generated_at: z.string().nullish(),
});

const toCents = (value: number) => Math.round(value * 100);

async function getOrder(id: string) {
  const response = await meRequest("GET", `/api/v2/me/orders/${encodeURIComponent(id)}`, undefined, {
    timeoutMessage: NO_ANSWER,
  });
  if (!isOk(response.status)) throw mapApiError(response.status, response.body);
  const parsed = orderSchema.safeParse(response.body);
  if (!parsed.success) throw new QuoteError(502, "Resposta inesperada do Melhor Envio ao consultar o envio.");
  return parsed.data;
}

export type PayResult =
  | { status: "paid"; protocol?: string }
  | { status: "insufficient"; pix: number }
  | { status: "price_changed"; total: number };

const ALREADY_PAID = /already been paid|já (foi|foram) pag/i;

/**
 * Pays the orders with the wallet balance, only if their total is still the one the user saw.
 * Safe to repeat: orders already paid are not charged again (the API answers a repeated
 * checkout with 204, or with the documented 422 "already been paid").
 */
export async function payOrders(ids: string[], expectedTotal: number): Promise<PayResult> {
  const prices = await cartPrices(ids);
  const outOfCart = ids.filter((id) => !prices.has(id));
  let paidTotal = 0;
  for (const id of outOfCart) {
    const order = await getOrder(id);
    if (!order.paid_at) throw new QuoteError(409, NOT_WAITING);
    paidTotal += order.price ?? 0;
  }
  const pending = ids.filter((id) => prices.has(id));
  if (pending.length === 0) return { status: "paid" };

  const total = round2(pending.reduce((sum, id) => sum + (prices.get(id) ?? 0), 0));
  const everything = round2(total + paidTotal);
  if (toCents(everything) !== toCents(expectedTotal)) return { status: "price_changed", total: everything };

  const missing = pixTopUpFor(total, await walletBalance());
  if (missing > 0) return { status: "insufficient", pix: missing };

  const response = await meRequest("POST", "/api/v2/me/shipment/checkout", { orders: pending }, {
    timeoutMessage: "O Melhor Envio não confirmou o pagamento. Confira na tela Envios antes de tentar de novo.",
  });
  if (response.status === 204) return { status: "paid" };
  if (!isOk(response.status)) {
    const message = JSON.stringify(response.body ?? "");
    if (response.status === 422 && ALREADY_PAID.test(message)) return { status: "paid" };
    throw mapApiError(response.status, response.body);
  }
  const protocol = (response.body as { purchase?: { protocol?: unknown } } | null)?.purchase?.protocol;
  return typeof protocol === "string" ? { status: "paid", protocol } : { status: "paid" };
}

export type PixCharge = { paymentId: string; amount: number; qrCodeUrl: string; copyPaste: string; expiresAt?: string };

const pixResponseSchema = z.looseObject({
  payment: z.looseObject({
    id: z.string(),
    link: z.string().nullish(),
    response: z
      .looseObject({
        data_response: z
          .looseObject({
            transaction: z.looseObject({ max_days_to_keep_waiting_payment: z.string().nullish() }).nullish(),
          })
          .nullish(),
      })
      .nullish(),
  }),
  redirect: z.string().nullish(),
  digitable: z.string().nullish(),
});

/**
 * Tops the wallet up by PIX with exactly what these orders are missing (decision D2).
 * Returns { amount: 0 } when the balance already covers them. Only what the screen needs
 * is returned: the gateway response also carries the account holder's name and CPF.
 */
export async function createPixForOrders(
  ids: string[],
  expectedTotal: number,
): Promise<PixCharge | { amount: 0 } | { priceChanged: number }> {
  const total = await cartTotal(ids);
  // The PIX is anchored to the price the user reviewed.
  if (toCents(total) !== toCents(expectedTotal)) return { priceChanged: total };
  const amount = pixTopUpFor(total, await walletBalance());
  if (amount === 0) return { amount: 0 };

  const response = await meRequest(
    "POST",
    "/api/v2/me/balance",
    { gateway: "yapay-transparente", slug: "pix", value: amount.toFixed(2) },
    { timeoutMessage: NO_ANSWER },
  );
  if (!isOk(response.status)) throw mapApiError(response.status, response.body);
  const parsed = pixResponseSchema.safeParse(response.body);
  const qrCodeUrl = parsed.success ? (parsed.data.payment.link ?? parsed.data.redirect) : null;
  const copyPaste = parsed.success ? parsed.data.digitable : null;
  if (!parsed.success || !qrCodeUrl || !copyPaste) {
    throw new QuoteError(502, "O Melhor Envio não devolveu o QR Code do PIX. Tente novamente.");
  }
  const expiresAt = parsed.data.payment.response?.data_response?.transaction?.max_days_to_keep_waiting_payment;
  return {
    paymentId: parsed.data.payment.id,
    amount,
    qrCodeUrl,
    copyPaste,
    ...(expiresAt ? { expiresAt } : {}),
  };
}

export type PixStatus = "pending" | "paid" | "failed";

const PAID = new Set(["authorized", "paid", "approved", "completed", "released"]);
const FAILED = new Set(["canceled", "cancelled", "unauthorized", "expired", "chargeback", "refused"]);

/** Status of a PIX top-up (undocumented GET /api/v2/me/payments/{id}, confirmed in production). */
export async function pixStatus(paymentId: string): Promise<PixStatus> {
  const response = await meRequest("GET", `/api/v2/me/payments/${encodeURIComponent(paymentId)}`, undefined, {
    timeoutMessage: NO_ANSWER,
  });
  if (!isOk(response.status)) throw mapApiError(response.status, response.body);
  const status = String((response.body as { status?: unknown } | null)?.status ?? "").toLowerCase();
  if (PAID.has(status)) return "paid";
  if (FAILED.has(status)) return "failed";
  return "pending";
}

export type GenerateResult = { id: string; ok: boolean; message: string };

/**
 * Asks the carriers to generate the labels. Generation is asynchronous: an ok result means
 * "sent for generation"; labelsStatus tells when each label is actually ready.
 */
export async function generateLabels(ids: string[]): Promise<GenerateResult[]> {
  const response = await meRequest("POST", "/api/v2/me/shipment/generate", { orders: ids }, { timeoutMessage: NO_ANSWER });
  if (!isOk(response.status)) throw mapApiError(response.status, response.body);
  const body = (response.body ?? {}) as Record<string, { status?: unknown; message?: unknown } | undefined>;
  return ids.map((id) => {
    const entry = body[id];
    if (!entry || typeof entry !== "object") {
      return { id, ok: false, message: "A transportadora não respondeu por este envio." };
    }
    return { id, ok: entry.status === true, message: typeof entry.message === "string" ? entry.message : "" };
  });
}

export type LabelStatus = { id: string; status: string; generated: boolean; tracking: string | null };

const GENERATED_STATUSES = new Set(["generated", "posted", "received", "delivered", "undelivered"]);

export async function labelsStatus(ids: string[]): Promise<LabelStatus[]> {
  const orders = await Promise.all(ids.map((id) => getOrder(id)));
  return orders.map((order) => ({
    id: order.id,
    status: order.status ?? "",
    generated: Boolean(order.generated_at) || GENERATED_STATUSES.has(order.status ?? ""),
    tracking: order.tracking ?? order.self_tracking ?? null,
  }));
}

export type LabelFile = { bytes: ArrayBuffer; contentType: string };

/** The file endpoint answers the storage URL as a bare JSON string or wrapped in an object. */
function fileUrlFrom(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const found = Object.values(body as Record<string, unknown>).find(
      (value) => typeof value === "string" && value.startsWith("http"),
    );
    return typeof found === "string" ? found : null;
  }
  return null;
}

/**
 * Downloads the label PDF on the server (decision in Task 15): the public print link would expose
 * the recipient's name, address and phone to anyone holding it. The token goes only to Melhor Envio,
 * never to the storage host.
 */
export async function labelFile(orderId: string): Promise<LabelFile> {
  const response = await meRequest("GET", `/api/v2/me/imprimir/pdf/${encodeURIComponent(orderId)}`, undefined, {
    timeoutMessage: NO_ANSWER,
  });
  if (!isOk(response.status)) throw mapApiError(response.status, response.body);

  const url = fileUrlFrom(response.body);
  if (!url || !url.startsWith("https://")) throw new QuoteError(502, "O Melhor Envio não devolveu o arquivo da etiqueta.");

  let file: Response;
  try {
    file = await fetch(url, { cache: "no-store" });
  } catch {
    throw new QuoteError(504, "Não foi possível baixar a etiqueta. Tente novamente.");
  }
  if (!file.ok) throw new QuoteError(502, "Não foi possível baixar a etiqueta. Tente novamente.");
  // Served from the app's own origin, so only a PDF is ever passed on.
  if (!(file.headers.get("content-type") ?? "").toLowerCase().includes("pdf")) {
    throw new QuoteError(502, "O arquivo recebido não é uma etiqueta em PDF. Tente de novo em instantes.");
  }
  return { bytes: await file.arrayBuffer(), contentType: "application/pdf" };
}

/** Order statuses the listing can be filtered by (Melhor Envio values). */
export const SHIPMENT_STATUSES = ["released", "generated", "posted", "delivered", "canceled", "undelivered"] as const;
export type ShipmentStatusFilter = (typeof SHIPMENT_STATUSES)[number];

export type ShipmentSummary = {
  id: string;
  protocol: string;
  status: string;
  service: string;
  price: number;
  recipient: string;
  destination: string;
  tracking: string | null;
  createdAt: string;
  paid: boolean;
  generated: boolean;
  /** Created by this app (tagged), as opposed to the Melhor Envio panel. */
  fromApp: boolean;
};

const listedOrderSchema = z.looseObject({
  id: z.string(),
  protocol: z.string().nullish(),
  status: z.string().nullish(),
  price: z.coerce.number().nullish(),
  tracking: z.string().nullish(),
  self_tracking: z.string().nullish(),
  created_at: z.string().nullish(),
  paid_at: z.string().nullish(),
  generated_at: z.string().nullish(),
  to: z.looseObject({ name: z.string().nullish(), city: z.string().nullish(), state_abbr: z.string().nullish() }).nullish(),
  service: z
    .looseObject({ name: z.string().nullish(), company: z.looseObject({ name: z.string().nullish() }).nullish() })
    .nullish(),
  tags: z.array(z.looseObject({ tag: z.string().nullish() })).nullish(),
});

const listPageSchema = z.looseObject({
  data: z.array(listedOrderSchema),
  current_page: z.coerce.number().optional(),
  last_page: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
});

function toSummary(order: z.output<typeof listedOrderSchema>): ShipmentSummary {
  const status = order.status ?? "";
  return {
    id: order.id,
    protocol: order.protocol ?? "",
    status,
    service: [order.service?.company?.name, order.service?.name].filter(Boolean).join(" · "),
    price: order.price ?? 0,
    recipient: order.to?.name ?? "",
    destination: [order.to?.city, order.to?.state_abbr].filter(Boolean).join("/"),
    tracking: order.tracking ?? order.self_tracking ?? null,
    createdAt: order.created_at ?? "",
    paid: Boolean(order.paid_at),
    generated: Boolean(order.generated_at) || GENERATED_STATUSES.has(status),
    fromApp: Boolean(order.tags?.some((tag) => tag.tag === APP_TAG)),
  };
}

async function readListPage(path: string) {
  const response = await meRequest("GET", path, undefined, { timeoutMessage: NO_ANSWER });
  if (!isOk(response.status)) throw mapApiError(response.status, response.body);
  // No results: the API answers 204 with no body instead of an empty page.
  if (response.status === 204 || response.body === null) return { data: [], current_page: 1, last_page: 1, total: 0 };
  const parsed = listPageSchema.safeParse(response.body);
  if (!parsed.success) throw new QuoteError(502, "Resposta inesperada do Melhor Envio ao listar os envios.");
  return parsed.data;
}

/** The account's shipments, newest first, ten per page like the API. */
export async function listShipments({ page, status }: { page: number; status?: ShipmentStatusFilter }) {
  const query = `page=${page}${status ? `&status=${status}` : ""}`;
  const data = await readListPage(`/api/v2/me/orders?${query}`);
  return {
    items: data.data.map(toSummary),
    page: data.current_page ?? page,
    lastPage: data.last_page ?? page,
    total: data.total ?? data.data.length,
  };
}

/** What is still in the cart, waiting for payment. */
export async function listCart(): Promise<ShipmentSummary[]> {
  const data = await readListPage(`${CART_PATH}?page=1`);
  return data.data.map(toSummary);
}

/**
 * Requests the cancellation of a paid label. It is asynchronous: the money returns to the
 * wallet within 12 hours. Carriers refuse once they have the package.
 */
export async function cancelShipment(id: string): Promise<void> {
  const response = await meRequest(
    "POST",
    "/api/v2/me/shipment/cancel",
    { order: { id, reason_id: "2", description: "Cancelado pela equipe no Cotador de Fretes." } },
    { timeoutMessage: NO_ANSWER },
  );
  if (!isOk(response.status)) throw mapApiError(response.status, response.body);
  const entry = (response.body as Record<string, { canceled?: unknown } | undefined> | null)?.[id];
  if (!entry || entry.canceled !== true) {
    throw new QuoteError(
      422,
      "O cancelamento não foi aceito. Se a transportadora já recebeu o pacote, não é mais possível cancelar.",
    );
  }
}

export type AgencyOption = { id: number; name: string; address: string; preferred: boolean };

const agencySchema = z.looseObject({
  id: z.coerce.number(),
  name: z.string().nullish(),
  address: z
    .looseObject({
      address: z.string().nullish(),
      number: z.union([z.string(), z.number()]).nullish(),
      city: z.looseObject({ city: z.string().nullish() }).nullish(),
    })
    .nullish(),
});

/**
 * Drop-off agencies for a carrier near an origin: the team's usual agency first
 * (even when it is in a neighbouring city), then the origin city's agencies by name.
 */
export async function listAgencies(companyId: number, origin: OriginId): Promise<AgencyOption[]> {
  const response = await meRequest("GET", `/api/v2/me/shipment/agencies?company=${companyId}&state=RS`, undefined, {
    timeoutMessage: NO_ANSWER,
  });
  if (!isOk(response.status)) throw mapApiError(response.status, response.body);
  const parsed = z.array(agencySchema).safeParse(response.body);
  if (!parsed.success) throw new QuoteError(502, "Resposta inesperada do Melhor Envio ao listar agências.");

  const city = ORIGINS.find((o) => o.id === origin)?.name.toLowerCase();
  const preferred = preferredAgency(origin, companyId);
  return parsed.data
    .filter((agency) => agency.id === preferred || agency.address?.city?.city?.toLowerCase() === city)
    .map((agency) => {
      const street = [agency.address?.address, agency.address?.number].filter(Boolean).join(", ");
      return {
        id: agency.id,
        name: agency.name?.trim() || `Agência ${agency.id}`,
        address: [street, agency.address?.city?.city].filter(Boolean).join(" - "),
        preferred: agency.id === preferred,
      };
    })
    .sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name, "pt-BR"));
}
