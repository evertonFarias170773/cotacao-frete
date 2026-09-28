import { describe, expect, test } from "vitest";
import { priceChangeMessage } from "./priceChange";

const nbsp = (s: string | null) => s?.replace(/\u00a0/g, " ") ?? null;

describe("priceChangeMessage", () => {
  test("says nothing when the cart confirms the quoted price", () => {
    expect(priceChangeMessage(137.66, 137.66)).toBeNull();
  });

  test("ignores differences below one cent from rounding", () => {
    expect(priceChangeMessage(137.66, 137.664)).toBeNull();
  });

  test("warns when the cart price went up", () => {
    expect(nbsp(priceChangeMessage(137.66, 140.1))).toBe("O preço mudou de R$ 137,66 na cotação para R$ 140,10 no carrinho.");
  });

  test("warns when it went down too, so the user knows why the total differs", () => {
    expect(nbsp(priceChangeMessage(74.2, 68.87))).toBe("O preço mudou de R$ 74,20 na cotação para R$ 68,87 no carrinho.");
  });
});
