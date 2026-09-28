import { describe, expect, test } from "vitest";
import { emitterDocumentFromKey, isValidNfeKey } from "./nfe";

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
  test("accepts a realistic key", () => {
    expect(isValidNfeKey("4326 0946 8670 2900 0176 5500 1000 0123 4511 2345 6780")).toBe(true);
  });
});

describe("emitterDocumentFromKey", () => {
  test("reads the issuer's CNPJ from positions 7 to 20 of the key", () => {
    expect(emitterDocumentFromKey("43260946867029000176550010000123451123456780")).toBe("46867029000176");
    expect(emitterDocumentFromKey("4326 0911 2223 3300 0181 5500 1000 0543 2118 7654 3211")).toBe("11222333000181");
  });
  test("returns null for something that is not a valid key", () => {
    expect(emitterDocumentFromKey("123")).toBeNull();
  });
});
