import { describe, expect, test } from "vitest";
import { buildProductsPayload, buildVolumesPayload, expandVolumes, wantsProductsMode } from "./payload";
import type { QuoteRequest } from "./schemas";

const request: QuoteRequest = {
  originId: "poa",
  destinationCep: "01018020",
  volumes: [
    { height: 17, width: 11, length: 11, weight: 0.3, insurance: 10.1, quantity: 1 },
    { height: 25, width: 20, length: 25, weight: 1.5, insurance: 1000, quantity: 2 },
  ],
  options: { receipt: true, own_hand: false },
};

describe("expandVolumes", () => {
  test("repeats each volume by its quantity and drops the quantity field", () => {
    const expanded = expandVolumes(request.volumes);
    expect(expanded).toHaveLength(3);
    expect(expanded[1]).toEqual({ height: 25, width: 20, length: 25, weight: 1.5, insurance: 1000 });
    expect(expanded[2]).toEqual(expanded[1]);
    expect("quantity" in expanded[0]).toBe(false);
  });
});

describe("buildVolumesPayload", () => {
  test("uses the origin CEP resolved from originId and digit-only CEPs", () => {
    const payload = buildVolumesPayload(request);
    expect(payload).toEqual({
      from: { postal_code: "90660130" },
      to: { postal_code: "01018020" },
      volumes: [
        { width: 11, height: 17, length: 11, weight: 0.3, insurance: 10.1 },
        { width: 20, height: 25, length: 25, weight: 1.5, insurance: 1000 },
        { width: 20, height: 25, length: 25, weight: 1.5, insurance: 1000 },
      ],
      options: { receipt: true, own_hand: false },
    });
    expect("services" in payload).toBe(false);
  });
});

describe("buildProductsPayload (plan B)", () => {
  test("converts each expanded volume into a product with quantity 1", () => {
    const payload = buildProductsPayload(request);
    expect(payload.from).toEqual({ postal_code: "90660130" });
    expect(payload.to).toEqual({ postal_code: "01018020" });
    expect(payload.options).toEqual({ receipt: true, own_hand: false });
    expect(payload.products).toHaveLength(3);
    expect(payload.products[0]).toEqual({
      id: "1",
      width: 11,
      height: 17,
      length: 11,
      weight: 0.3,
      insurance_value: 10.1,
      quantity: 1,
    });
    expect(payload.products.map((p) => p.id)).toEqual(["1", "2", "3"]);
  });
});

describe("wantsProductsMode", () => {
  test("detects a 422 that asks for products", () => {
    expect(wantsProductsMode({ message: "The given data was invalid.", errors: { products: ["O campo products é obrigatório."] } })).toBe(true);
    expect(wantsProductsMode({ message: "The products field is required." })).toBe(true);
  });
  test("ignores unrelated validation errors", () => {
    expect(wantsProductsMode({ message: "The given data was invalid.", errors: { "to.postal_code": ["inválido"] } })).toBe(false);
    expect(wantsProductsMode(null)).toBe(false);
    expect(wantsProductsMode("oops")).toBe(false);
  });
});
