import { describe, expect, test } from "vitest";
import { quoteRequestSchema, quoteFormSchema, volumeSchema } from "./schemas";

const volume = { height: 10, width: 11, length: 12, weight: 0.3, insurance: 10.1, quantity: 1 };

describe("quoteRequestSchema", () => {
  test("accepts a valid request and strips CEP mask", () => {
    const parsed = quoteRequestSchema.parse({
      originId: "poa",
      destinationCep: "01018-020",
      volumes: [volume],
      options: { receipt: false, own_hand: false },
    });
    expect(parsed.destinationCep).toBe("01018020");
    expect(parsed.volumes).toHaveLength(1);
  });

  test("defaults options to false when omitted", () => {
    const parsed = quoteRequestSchema.parse({ originId: "scs", destinationCep: "01018020", volumes: [volume] });
    expect(parsed.options).toEqual({ receipt: false, own_hand: false });
  });

  test("rejects CEP with fewer than 8 digits with the friendly message", () => {
    const result = quoteRequestSchema.safeParse({ originId: "poa", destinationCep: "0101802", volumes: [volume] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Informe um CEP com 8 dígitos.");
    }
  });

  test("rejects unknown origin", () => {
    expect(quoteRequestSchema.safeParse({ originId: "rio", destinationCep: "01018020", volumes: [volume] }).success).toBe(false);
  });

  test("rejects empty volume list", () => {
    expect(quoteRequestSchema.safeParse({ originId: "poa", destinationCep: "01018020", volumes: [] }).success).toBe(false);
  });
});

describe("volumeSchema", () => {
  test("rejects non-positive dimensions and weight", () => {
    expect(volumeSchema.safeParse({ ...volume, height: 0 }).success).toBe(false);
    expect(volumeSchema.safeParse({ ...volume, width: -1 }).success).toBe(false);
    expect(volumeSchema.safeParse({ ...volume, length: 0 }).success).toBe(false);
    expect(volumeSchema.safeParse({ ...volume, weight: 0 }).success).toBe(false);
  });
  test("allows zero insurance but not negative", () => {
    expect(volumeSchema.safeParse({ ...volume, insurance: 0 }).success).toBe(true);
    expect(volumeSchema.safeParse({ ...volume, insurance: -5 }).success).toBe(false);
  });
  test("quantity must be an integer >= 1", () => {
    expect(volumeSchema.safeParse({ ...volume, quantity: 0 }).success).toBe(false);
    expect(volumeSchema.safeParse({ ...volume, quantity: 1.5 }).success).toBe(false);
    expect(volumeSchema.safeParse({ ...volume, quantity: 3 }).success).toBe(true);
  });
});

describe("quoteFormSchema (string inputs from the form)", () => {
  const formVolume = { height: "10", width: "11", length: "12", weight: "0,3", insurance: "1.250,00", quantity: "2" };

  test("converts string fields to numbers, accepting comma decimals", () => {
    const parsed = quoteFormSchema.parse({
      originId: "poa",
      destinationCep: "01018-020",
      volumes: [formVolume],
      options: { receipt: true, own_hand: false },
    });
    expect(parsed.volumes[0]).toEqual({ height: 10, width: 11, length: 12, weight: 0.3, insurance: 1250, quantity: 2 });
    expect(parsed.destinationCep).toBe("01018020");
    expect(parsed.options.receipt).toBe(true);
  });

  test("reports an inline message for empty and non-numeric fields", () => {
    const result = quoteFormSchema.safeParse({
      originId: "poa",
      destinationCep: "01018020",
      volumes: [{ ...formVolume, height: "", weight: "abc" }],
      options: { receipt: false, own_hand: false },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const byPath = Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
      expect(byPath["volumes.0.height"]).toBe("Obrigatório");
      expect(byPath["volumes.0.weight"]).toBe("Número inválido");
    }
  });

  test("applies the numeric rules after conversion", () => {
    const result = quoteFormSchema.safeParse({
      originId: "poa",
      destinationCep: "01018020",
      volumes: [{ ...formVolume, height: "0" }],
      options: { receipt: false, own_hand: false },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path.join(".")).toBe("volumes.0.height");
      expect(result.error.issues[0].message).toBe("Deve ser maior que zero");
    }
  });

  test("requires an origin", () => {
    const result = quoteFormSchema.safeParse({
      destinationCep: "01018020",
      volumes: [formVolume],
      options: { receipt: false, own_hand: false },
    });
    expect(result.success).toBe(false);
  });
});
