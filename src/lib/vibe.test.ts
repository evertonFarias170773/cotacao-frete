import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { QuoteError } from "./errors";
import { parseNfeXml } from "./nfeXml";
import {
  NO_POSTAL_CODE,
  NOT_WEIGHED,
  TOO_MANY_BOXES,
  boxesFromWeight,
  compareNfeWithVibe,
  hasDeliveryPostalCode,
  toVibeOrder,
  vibeResponseSchema,
} from "./vibe";
import raw from "./__fixtures__/vibe-pedido.json";

const nbsp = (s: string) => s.replace(/ /g, " ");
const nfe = parseNfeXml(readFileSync(new URL("./__fixtures__/nfe-ficticia.xml", import.meta.url), "utf8"));

type RawOrder = Omit<typeof raw, "peso_aferido_kg" | "volumes"> & {
  peso_aferido_kg: unknown;
  volumes: { quantidade: unknown; tipo: string; lista: { numero: number; peso_kg: unknown }[] };
};

const response = (patch: (body: RawOrder) => void = () => undefined) => {
  const body = structuredClone(raw) as RawOrder;
  patch(body);
  return vibeResponseSchema.parse(body);
};

describe("boxesFromWeight", () => {
  test("one box: the height and the declared value come from the weight", () => {
    expect(boxesFromWeight(4.95, 1, [null])).toEqual([
      { quantity: 1, width: 22, length: 32, weight: 4.95, height: 11.88, insurance: 668.25 },
    ]);
  });

  test("several boxes without their own weight split the weighed total equally", () => {
    expect(boxesFromWeight(9, 3, [null, null, null])).toEqual([
      { quantity: 3, width: 22, length: 32, weight: 3, height: 7.2, insurance: 405 },
    ]);
  });

  test("uses each box's weight when every box has one", () => {
    expect(boxesFromWeight(99, 2, [2, 5])).toEqual([
      { quantity: 1, width: 22, length: 32, weight: 2, height: 4.8, insurance: 270 },
      { quantity: 1, width: 22, length: 32, weight: 5, height: 12, insurance: 675 },
    ]);
  });

  test("a partial list of box weights falls back to the equal split", () => {
    expect(boxesFromWeight(6, 2, [2, null])).toEqual([
      { quantity: 2, width: 22, length: 32, weight: 3, height: 7.2, insurance: 405 },
    ]);
  });

  test("a list whose size differs from the box count falls back to the equal split", () => {
    expect(boxesFromWeight(6, 3, [2, 2])).toEqual([
      { quantity: 3, width: 22, length: 32, weight: 2, height: 4.8, insurance: 270 },
    ]);
  });

  test("a missing or zero box count means one box", () => {
    expect(boxesFromWeight(1, null, [])).toHaveLength(1);
    expect(boxesFromWeight(1, 0, [])[0].quantity).toBe(1);
  });

  test("rounds the split weight to grams", () => {
    const [box] = boxesFromWeight(10, 3, [null, null, null]);
    expect(box.weight).toBe(3.333);
    expect(box.height).toBe(8);
    expect(box.insurance).toBe(449.96);
  });

  test("no weight at all means nothing to fill", () => {
    expect(boxesFromWeight(null, 2, [null, null])).toEqual([]);
    expect(boxesFromWeight(0, 1, [null])).toEqual([]);
  });

  test("more distinct weights than the form holds falls back to the equal split", () => {
    const weights = Array.from({ length: 25 }, (_, index) => index + 1);
    const plan = boxesFromWeight(null, 25, weights);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ quantity: 25, weight: 13 });
  });

  test("more than 50 identical boxes are split into lines of at most 50", () => {
    const plan = boxesFromWeight(120, 120, []);
    expect(plan.map((box) => box.quantity)).toEqual([50, 50, 20]);
  });
});

describe("vibeResponseSchema", () => {
  test("accepts numbers sent as text, with dot or comma", () => {
    expect(response((b) => (b.peso_aferido_kg = "4.95")).peso_aferido_kg).toBe(4.95);
    expect(response((b) => (b.peso_aferido_kg = "4,95")).peso_aferido_kg).toBe(4.95);
  });

  test("null text fields become empty strings", () => {
    expect(response().entrega.destinatario.telefone).toBe("");
    expect(response().entrega.endereco.complemento).toBe("");
  });

  test("refuses a body without the delivery block", () => {
    expect(vibeResponseSchema.safeParse({ id_int: 1 }).success).toBe(false);
  });
});

describe("toVibeOrder", () => {
  test("keeps only what the app uses: recipient, CEP, weight and boxes", () => {
    expect(toVibeOrder(response())).toEqual({
      id: 22773,
      postalCode: "01018020",
      totalWeight: 4.95,
      recipient: {
        name: "CLIENTE FICTÍCIO COMÉRCIO LTDA",
        document: "11222333000181",
        phone: "",
        email: "compras@example.com",
        address: "Rua Anita Garibaldi",
        number: "25",
        complement: "",
        district: "Sé",
        city: "São Paulo",
        stateAbbr: "SP",
      },
      boxes: [{ quantity: 1, width: 22, length: 32, weight: 4.95, height: 11.88, insurance: 668.25 }],
    });
  });

  test("the total weight is the sum of the box weights when every box has one", () => {
    const order = toVibeOrder(
      response((b) => {
        b.volumes.quantidade = 2;
        b.volumes.lista = [
          { numero: 1, peso_kg: 2 },
          { numero: 2, peso_kg: 5 },
        ];
      }),
    );
    expect(order.totalWeight).toBe(7);
  });

  test("an order not weighed at dispatch is refused with a clear message", () => {
    let error: unknown;
    try {
      toVibeOrder(response((b) => (b.peso_aferido_kg = null)));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(QuoteError);
    expect((error as QuoteError).status).toBe(422);
    expect((error as QuoteError).message).toBe(NOT_WEIGHED);
  });

  test("a delivery CEP without 8 digits is refused", () => {
    expect(() => toVibeOrder(response((b) => (b.entrega.endereco.cep = "0101")))).toThrow(NO_POSTAL_CODE);
  });

  test("an order with more boxes than any quote holds is refused before building them", () => {
    let error: unknown;
    try {
      toVibeOrder(response((b) => (b.volumes.quantidade = 22773)));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(QuoteError);
    expect((error as QuoteError).status).toBe(422);
    expect((error as QuoteError).message).toBe(TOO_MANY_BOXES);
  });

  test("1000 boxes still fit the form", () => {
    const order = toVibeOrder(response((b) => (b.volumes.quantidade = 1000)));
    expect(order.boxes).toHaveLength(20);
  });

  test("a CEP with a hyphen is accepted", () => {
    expect(toVibeOrder(response((b) => (b.entrega.endereco.cep = "01018-020"))).postalCode).toBe("01018020");
  });
});

describe("compareNfeWithVibe", () => {
  const order = toVibeOrder(response());

  test("same recipient, ignoring case, accents and spacing, gives no warning", () => {
    expect(compareNfeWithVibe(nfe, order)).toEqual([]);
  });

  test("warns about a different CEP, saying the invoice wins", () => {
    const other = { ...order, postalCode: "90010000" };
    expect(compareNfeWithVibe(nfe, other).map(nbsp)).toEqual([
      "O CEP da nota (01018-020) é diferente do CEP do pedido 22773 (90010-000). A cotação usa o CEP da nota.",
    ]);
  });

  test("warns about a different name and a different document", () => {
    const other = { ...order, recipient: { ...order.recipient, name: "Outra Loja LTDA", document: "52998224725" } };
    expect(compareNfeWithVibe(nfe, other)).toEqual([
      "O destinatário da nota (Cliente Ficticio Comercio LTDA) é diferente do cliente do pedido 22773 (Outra Loja LTDA). A etiqueta usa o da nota.",
      "O CPF/CNPJ do destinatário da nota é diferente do cadastrado no pedido 22773. A etiqueta usa o da nota.",
    ]);
  });

  test("an order without a document does not warn about it", () => {
    const other = { ...order, recipient: { ...order.recipient, document: "" } };
    expect(compareNfeWithVibe(nfe, other)).toEqual([]);
  });
});

describe("hasDeliveryPostalCode", () => {
  test("an invoice with an 8-digit delivery CEP can replace the order's CEP", () => {
    expect(hasDeliveryPostalCode(nfe)).toBe(true);
  });

  test("an invoice without a delivery CEP cannot (the CEP is optional in the NF-e layout)", () => {
    expect(hasDeliveryPostalCode({ ...nfe, recipient: { ...nfe.recipient, postalCode: "" } })).toBe(false);
  });
});
