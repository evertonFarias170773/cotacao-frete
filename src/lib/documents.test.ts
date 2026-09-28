import { describe, expect, test } from "vitest";
import { documentKind, isValidCnpj, isValidCpf } from "./documents";

describe("isValidCpf", () => {
  test("accepts a valid CPF with or without mask", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });
  test("rejects wrong check digits, repeated digits and wrong length", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
  });
});

describe("isValidCnpj", () => {
  test("accepts a valid numeric CNPJ", () => {
    expect(isValidCnpj("46.867.029/0001-76")).toBe(true);
  });
  test("accepts the alphanumeric CNPJ issued since July 2026", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
  });
  test("rejects wrong check digits and repeated digits", () => {
    expect(isValidCnpj("46.867.029/0001-77")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});

describe("documentKind", () => {
  test("tells CPF from CNPJ and rejects invalid ones", () => {
    expect(documentKind("529.982.247-25")).toBe("cpf");
    expect(documentKind("46.867.029/0001-76")).toBe("cnpj");
    expect(documentKind("123")).toBeNull();
  });
});
