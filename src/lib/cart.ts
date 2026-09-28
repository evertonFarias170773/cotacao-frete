import { expandVolumes } from "./payload";
import type { QuoteRequest } from "./schemas";

/** Services that reject more than one volume per cart item (account service list, Sept 2026). */
export const SINGLE_VOLUME_SERVICES: ReadonlySet<number> = new Set([1, 2, 17, 31, 32, 33, 34]);

export type Party = {
  name: string;
  phone: string;
  email?: string;
  /** CPF, for people. */
  document?: string;
  /** CNPJ, for companies. */
  companyDocument?: string;
  stateRegister?: string;
  economicActivityCode?: string;
  address: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  postalCode: string;
  stateAbbr: string;
};

export type ShipmentContent =
  | { kind: "declaration"; description: string }
  | { kind: "invoice"; key: string };

type ApiParty = {
  name: string;
  phone: string;
  email?: string;
  document?: string;
  company_document?: string;
  state_register?: string;
  economic_activity_code?: string;
  address: string;
  complement?: string;
  number: string;
  district: string;
  city: string;
  postal_code: string;
  country_id: "BR";
  state_abbr: string;
};

export type CartItemPayload = {
  service: number;
  agency?: number;
  from: ApiParty;
  to: ApiParty;
  products: { name: string; quantity: string; unitary_value: string }[];
  volumes: { height: number; width: number; length: number; weight: number }[];
  options: {
    insurance_value: number;
    receipt: boolean;
    own_hand: boolean;
    reverse: false;
    non_commercial: boolean;
    platform: string;
    invoice?: { key: string };
    tags: { tag: string; url: null }[];
  };
};

export type BuildCartInput = {
  request: QuoteRequest;
  serviceId: number;
  sender: Party;
  recipient: Party;
  content: ShipmentContent;
  agencyId?: number;
  /** Our own reference, visible in the Melhor Envio panel. */
  tag: string;
};

export class CartBuildError extends Error {}

const digits = (value: string) => value.replace(/\D/g, "");
const round2 = (value: number) => Math.round(value * 100) / 100;

function toApiParty(party: Party, stateRegister: string | undefined): ApiParty {
  const api: ApiParty = {
    name: party.name.trim(),
    phone: digits(party.phone),
    address: party.address.trim(),
    number: party.number.trim(),
    district: party.district.trim(),
    city: party.city.trim(),
    postal_code: digits(party.postalCode),
    country_id: "BR",
    state_abbr: party.stateAbbr.toUpperCase(),
  };
  if (party.email) api.email = party.email.trim();
  if (party.complement) api.complement = party.complement.trim();
  if (party.document) api.document = digits(party.document);
  if (party.companyDocument) api.company_document = party.companyDocument.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (stateRegister !== undefined) api.state_register = stateRegister;
  if (party.economicActivityCode) api.economic_activity_code = digits(party.economicActivityCode);
  return api;
}

/** Turns an accepted quote into Melhor Envio cart items, splitting per volume where the carrier demands it. */
export function buildCartItems(input: BuildCartInput): CartItemPayload[] {
  const { request, serviceId, sender, recipient, content, agencyId, tag } = input;
  if (digits(recipient.postalCode) !== request.destinationCep) {
    throw new CartBuildError("O CEP do destinatário é diferente do CEP cotado. Faça uma nova cotação.");
  }

  const commercial = content.kind === "invoice";
  const from = toApiParty(sender, commercial ? (sender.stateRegister ?? "") : "");
  const to = toApiParty(recipient, undefined);
  const physical = expandVolumes(request.volumes);
  const groups = SINGLE_VOLUME_SERVICES.has(serviceId) ? physical.map((volume) => [volume]) : [physical];

  return groups.map((volumes) => {
    const insurance = round2(volumes.reduce((total, volume) => total + volume.insurance, 0));
    const item: CartItemPayload = {
      service: serviceId,
      from,
      to,
      products: volumes.map((volume) => ({
        name: content.kind === "declaration" ? content.description.trim() : "Mercadoria",
        quantity: "1",
        unitary_value: volume.insurance.toFixed(2),
      })),
      volumes: volumes.map((volume) => ({
        height: Math.ceil(volume.height),
        width: Math.ceil(volume.width),
        length: Math.ceil(volume.length),
        weight: volume.weight,
      })),
      options: {
        insurance_value: insurance,
        receipt: request.options.receipt,
        own_hand: request.options.own_hand,
        reverse: false,
        non_commercial: !commercial,
        platform: "Cotador de Fretes",
        tags: [{ tag, url: null }],
      },
    };
    if (commercial) item.options.invoice = { key: digits(content.key) };
    if (agencyId !== undefined) item.agency = agencyId;
    return item;
  });
}
