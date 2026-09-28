import { describe, expect, test } from "vitest";
import { normalizeQuoteResponse, pickBadges } from "./normalize";

const service = (over: Record<string, unknown>) => ({
  id: 1,
  name: "PAC",
  price: "25.50",
  custom_price: "25.50",
  discount: "0.00",
  currency: "R$",
  delivery_time: 5,
  delivery_range: { min: 4, max: 5 },
  custom_delivery_time: 5,
  custom_delivery_range: { min: 4, max: 5 },
  packages: [{ price: "25.50", format: "box" }],
  additional_services: { receipt: false, own_hand: false, collect: false },
  company: { id: 1, name: "Correios", picture: "https://cdn/correios.png" },
  ...over,
});

describe("normalizeQuoteResponse", () => {
  test("maps string prices to numbers and prefers custom_price", () => {
    const { available } = normalizeQuoteResponse([service({ price: "30.00", custom_price: "25.50" })]);
    expect(available[0]).toMatchObject({
      id: 1,
      service: "PAC",
      company: "Correios",
      companyId: 1,
      logoUrl: "https://cdn/correios.png",
      price: 25.5,
      originalPrice: 30,
      deliveryMin: 4,
      deliveryMax: 5,
    });
    expect(available[0].packages).toHaveLength(1);
  });

  test("falls back to price when custom_price is missing and omits originalPrice when equal", () => {
    const { available } = normalizeQuoteResponse([service({ custom_price: undefined, price: "40.00" })]);
    expect(available[0].price).toBe(40);
    expect(available[0].originalPrice).toBeUndefined();
  });

  test("falls back through delivery fields when custom range is missing", () => {
    const a = normalizeQuoteResponse([service({ custom_delivery_range: undefined, custom_delivery_time: 7 })]).available[0];
    expect([a.deliveryMin, a.deliveryMax]).toEqual([7, 7]);
    const b = normalizeQuoteResponse([service({ custom_delivery_range: undefined, custom_delivery_time: undefined })]).available[0];
    expect([b.deliveryMin, b.deliveryMax]).toEqual([4, 5]);
    const c = normalizeQuoteResponse([
      service({ custom_delivery_range: undefined, custom_delivery_time: undefined, delivery_range: undefined, delivery_time: 3 }),
    ]).available[0];
    expect([c.deliveryMin, c.deliveryMax]).toEqual([3, 3]);
  });

  test("sorts by price ascending, then by shortest delivery", () => {
    const { available } = normalizeQuoteResponse([
      service({ id: 1, name: "A", custom_price: "30.00", custom_delivery_range: { min: 5, max: 6 } }),
      service({ id: 2, name: "B", custom_price: "20.00", custom_delivery_range: { min: 3, max: 4 } }),
      service({ id: 3, name: "C", custom_price: "20.00", custom_delivery_range: { min: 1, max: 2 } }),
    ]);
    expect(available.map((o) => o.id)).toEqual([3, 2, 1]);
  });

  test("moves services with error to unavailable with the reason", () => {
    const result = normalizeQuoteResponse([
      service({ id: 2, name: "SEDEX", error: "Peso excede o limite.", price: undefined, custom_price: undefined }),
      service({ id: 1 }),
    ]);
    expect(result.available.map((o) => o.id)).toEqual([1]);
    expect(result.unavailable).toEqual([{ name: "SEDEX", company: "Correios", reason: "Peso excede o limite." }]);
  });

  test("treats a service without any price as unavailable", () => {
    const result = normalizeQuoteResponse([service({ price: undefined, custom_price: undefined })]);
    expect(result.available).toHaveLength(0);
    expect(result.unavailable[0].reason).toBe("Preço não informado");
  });

  test("tolerates unknown extra fields and missing optional ones", () => {
    const result = normalizeQuoteResponse([{ id: 9, name: "X", custom_price: "1.00", company: { name: "Y" }, something_new: true }]);
    expect(result.available[0]).toMatchObject({ id: 9, service: "X", company: "Y", price: 1 });
    expect(result.available[0].logoUrl).toBeUndefined();
  });

  test("throws when the response is not a list of services", () => {
    expect(() => normalizeQuoteResponse({ message: "nope" })).toThrow();
  });
});

describe("pickBadges", () => {
  test("cheapest is the first item; fastest only when a different item is faster", () => {
    const badges = pickBadges([
      { id: 1, service: "A", company: "X", price: 10, deliveryMin: 5, deliveryMax: 7 },
      { id: 2, service: "B", company: "X", price: 12, deliveryMin: 1, deliveryMax: 2 },
      { id: 3, service: "C", company: "X", price: 15, deliveryMin: 1, deliveryMax: 2 },
    ]);
    expect(badges).toEqual({ cheapestId: 1, fastestId: 2 });
  });
  test("no fastest badge when the cheapest is also the fastest", () => {
    const badges = pickBadges([
      { id: 1, service: "A", company: "X", price: 10, deliveryMin: 1, deliveryMax: 2 },
      { id: 2, service: "B", company: "X", price: 12, deliveryMin: 3, deliveryMax: 4 },
    ]);
    expect(badges).toEqual({ cheapestId: 1, fastestId: undefined });
  });
  test("empty list yields no badges", () => {
    expect(pickBadges([])).toEqual({ cheapestId: undefined, fastestId: undefined });
  });
});
