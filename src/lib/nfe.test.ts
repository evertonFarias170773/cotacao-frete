import { describe, expect, test } from "vitest";
import { isValidNfeKey } from "./nfe";

// 44 digits; positions 21-22 hold the document model, and Melhor Envio only accepts model 55 (NF-e).
const MODEL_55_KEY = "1".repeat(20) + "55" + "1".repeat(21) + "8";

describe("isValidNfeKey", () => {
  test("accepts a model 55 key with the right check digit, masked or not", () => {
    expect(isValidNfeKey(MODEL_55_KEY)).toBe(true);
    const masked = MODEL_55_KEY.replace(/(\d{4})/g, "$1 ");
    expect(masked).toContain(" ");
    expect(isValidNfeKey(masked)).toBe(true);
  });
  test("rejects a wrong check digit and wrong lengths", () => {
    expect(isValidNfeKey(MODEL_55_KEY.slice(0, 43) + "9")).toBe(false);
    expect(isValidNfeKey(MODEL_55_KEY.slice(0, 43))).toBe(false);
  });
  test("rejects other fiscal document models, even with a valid check digit", () => {
    expect(isValidNfeKey("1".repeat(43) + "2")).toBe(false);
  });
});
