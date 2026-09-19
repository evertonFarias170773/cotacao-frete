import { describe, expect, test } from "vitest";
import {
  formatCurrency,
  formatDeliveryRange,
  formatCep,
  formatKg,
  formatNumber,
  onlyDigits,
  parseDecimal,
} from "./format";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("formatCurrency", () => {
  test("formats as BRL with pt-BR separators", () => {
    expect(nbsp(formatCurrency(1250))).toBe("R$ 1.250,00");
    expect(nbsp(formatCurrency(10.1))).toBe("R$ 10,10");
    expect(nbsp(formatCurrency(0))).toBe("R$ 0,00");
  });
});

describe("formatKg", () => {
  test("uses comma decimal and kg suffix", () => {
    expect(nbsp(formatKg(4.2))).toBe("4,2 kg");
    expect(nbsp(formatKg(1))).toBe("1 kg");
    expect(nbsp(formatKg(0.3))).toBe("0,3 kg");
  });
});

describe("formatDeliveryRange", () => {
  test("single day", () => {
    expect(formatDeliveryRange(1, 1)).toBe("1 dia útil");
  });
  test("same min and max", () => {
    expect(formatDeliveryRange(3, 3)).toBe("3 dias úteis");
  });
  test("range", () => {
    expect(formatDeliveryRange(3, 5)).toBe("3 a 5 dias úteis");
  });
  test("only one bound known", () => {
    expect(formatDeliveryRange(4, undefined)).toBe("4 dias úteis");
    expect(formatDeliveryRange(undefined, 1)).toBe("1 dia útil");
  });
  test("nothing known", () => {
    expect(formatDeliveryRange(undefined, undefined)).toBe("Prazo não informado");
  });
});

describe("onlyDigits", () => {
  test("strips everything but digits", () => {
    expect(onlyDigits("90.660-130")).toBe("90660130");
    expect(onlyDigits("")).toBe("");
  });
});

describe("formatCep", () => {
  test("formats 8 digits as 00000-000", () => {
    expect(formatCep("90660130")).toBe("90660-130");
    expect(formatCep("90660-130")).toBe("90660-130");
  });
  test("masks partial input while typing", () => {
    expect(formatCep("906")).toBe("906");
    expect(formatCep("90660")).toBe("90660");
    expect(formatCep("906601")).toBe("90660-1");
  });
  test("ignores extra characters beyond 8 digits", () => {
    expect(formatCep("906601301234")).toBe("90660-130");
  });
});

describe("parseDecimal", () => {
  test("accepts comma or dot as decimal separator", () => {
    expect(parseDecimal("10,5")).toBe(10.5);
    expect(parseDecimal("10.5")).toBe(10.5);
    expect(parseDecimal("3")).toBe(3);
  });
  test("accepts pt-BR thousands with comma decimals", () => {
    expect(parseDecimal("1.250,00")).toBe(1250);
  });
  test("accepts en-US thousands with dot decimals", () => {
    expect(parseDecimal("1,250.00")).toBe(1250);
  });
  test("returns null for empty or non-numeric input", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNull();
  });
});

describe("formatNumber", () => {
  test("uses comma as decimal separator and drops trailing zeros", () => {
    expect(formatNumber(21.6)).toBe("21,6");
    expect(formatNumber(36)).toBe("36");
    expect(formatNumber(2.4)).toBe("2,4");
  });
});
