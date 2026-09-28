import { describe, expect, test } from "vitest";
import { CartBuildError, buildCartItems, type Party } from "./cart";
import type { QuoteRequest } from "./schemas";

const sender: Party = {
  name: "Empresa Remetente LTDA",
  phone: "(51) 3333-4444",
  email: "expedicao@empresa.com.br",
  companyDocument: "46.867.029/0001-76",
  stateRegister: "1234567890",
  economicActivityCode: "4687701",
  address: "Rua do Remetente",
  number: "100",
  district: "Centro",
  city: "Porto Alegre",
  postalCode: "90660-130",
  stateAbbr: "RS",
};

const recipient: Party = {
  name: "Cliente Destino",
  phone: "(11) 91234-5678",
  document: "529.982.247-25",
  address: "Rua Anita Garibaldi",
  number: "25",
  complement: "sala 2",
  district: "Sé",
  city: "São Paulo",
  postalCode: "01018-020",
  stateAbbr: "SP",
};

// 18 Triband: one form card, quantity 2.
const request: QuoteRequest = {
  originId: "poa",
  destinationCep: "01018020",
  volumes: [{ height: 21.6, width: 22, length: 32, weight: 9.45, insurance: 1215, quantity: 2 }],
  options: { receipt: false, own_hand: false },
};

const declaration = { kind: "declaration", description: "Triband" } as const;

describe("buildCartItems", () => {
  test("Correios gets one cart item per physical volume", () => {
    const items = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "cotador" });
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.volumes).toHaveLength(1);
      expect(item.options.insurance_value).toBe(1215);
      expect(item.products).toEqual([{ name: "Triband", quantity: "1", unitary_value: "1215.00" }]);
    }
  });

  test("Jadlog keeps all volumes in a single item", () => {
    const content = { kind: "invoice", key: "1".repeat(43) + "2" } as const;
    const items = buildCartItems({ request, serviceId: 3, sender, recipient, content, tag: "cotador" });
    expect(items).toHaveLength(1);
    expect(items[0].volumes).toHaveLength(2);
    expect(items[0].options.insurance_value).toBe(2430);
  });

  test("rounds dimensions up to whole centimetres, never down", () => {
    const [item] = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "cotador" });
    expect(item.volumes[0]).toEqual({ height: 22, width: 22, length: 32, weight: 9.45 });
  });

  test("a content declaration is non-commercial and has no invoice", () => {
    const [item] = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "cotador" });
    expect(item.options.non_commercial).toBe(true);
    expect(item.options.invoice).toBeUndefined();
    expect(item.from.state_register).toBe("");
  });

  test("an invoice makes the shipment commercial and sends the sender's state registration", () => {
    const content = { kind: "invoice", key: "1".repeat(43) + "2" } as const;
    const [item] = buildCartItems({ request, serviceId: 3, sender, recipient, content, tag: "cotador" });
    expect(item.options.non_commercial).toBe(false);
    expect(item.options.invoice).toEqual({ key: "1".repeat(43) + "2" });
    expect(item.from.state_register).toBe("1234567890");
  });

  test("sends digits only for documents, phones and CEPs, and the right document field", () => {
    const [item] = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "cotador" });
    expect(item.from).toMatchObject({ company_document: "46867029000176", phone: "5133334444", postal_code: "90660130", country_id: "BR" });
    expect(item.to).toMatchObject({ document: "52998224725", phone: "11912345678", postal_code: "01018020" });
    expect(item.to.company_document).toBeUndefined();
  });

  test("forwards the additional services and tags the order", () => {
    const withOptions = { ...request, options: { receipt: true, own_hand: true } };
    const [item] = buildCartItems({ request: withOptions, serviceId: 1, sender, recipient, content: declaration, tag: "cotador-123" });
    expect(item.options).toMatchObject({ receipt: true, own_hand: true, reverse: false });
    expect(item.options.tags).toEqual([{ tag: "cotador-123", url: null }]);
  });

  test("includes the agency only when one is given", () => {
    const [without] = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "t" });
    expect("agency" in without).toBe(false);
    const content = { kind: "invoice", key: "1".repeat(43) + "2" } as const;
    const [withAgency] = buildCartItems({ request, serviceId: 3, sender, recipient, content, agencyId: 45696, tag: "t" });
    expect(withAgency.agency).toBe(45696);
  });

  test("refuses a recipient whose CEP is not the quoted destination", () => {
    const elsewhere = { ...recipient, postalCode: "90010-000" };
    expect(() =>
      buildCartItems({ request, serviceId: 1, sender, recipient: elsewhere, content: declaration, tag: "t" }),
    ).toThrow(CartBuildError);
  });
});
