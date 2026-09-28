import "server-only";
import { z } from "zod";
import { preferredAgency } from "@/config/agencies";
import { ORIGINS, type OriginId } from "@/config/origins";
import { SenderConfigError, getSender } from "@/config/senders";
import { CartBuildError, buildCartItems, type Party } from "./cart";
import { QuoteError, mapApiError } from "./errors";
import { meRequest } from "./melhorEnvio";
import { contractBlockReason, toRecipientParty, type ContractRequest } from "./recipient";

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
