import { describe, expect, test } from "vitest";
import { formSignature, requestSignature } from "./signature";
import { quoteFormSchema, type QuoteRequest } from "./schemas";

const form = {
  originId: "poa",
  destinationCep: "01018-020",
  volumes: [{ height: "21,6", width: "22", length: "32", weight: "9,45", insurance: "1215", quantity: "2" }],
  options: { receipt: false, own_hand: false },
};

const request: QuoteRequest = {
  originId: "poa",
  destinationCep: "01018020",
  volumes: [{ height: 21.6, width: 22, length: 32, weight: 9.45, insurance: 1215, quantity: 2 }],
  options: { receipt: false, own_hand: false },
};

describe("requestSignature", () => {
  test("is stable for the same request", () => {
    expect(requestSignature(request)).toBe(requestSignature(structuredClone(request)));
  });

  test("changes with the origin", () => {
    expect(requestSignature({ ...request, originId: "scs" })).not.toBe(requestSignature(request));
  });

  test("changes with the destination", () => {
    expect(requestSignature({ ...request, destinationCep: "90010000" })).not.toBe(requestSignature(request));
  });

  test("changes with any volume field", () => {
    const fields = ["height", "width", "length", "weight", "insurance", "quantity"] as const;
    for (const field of fields) {
      const changed = { ...request, volumes: [{ ...request.volumes[0], [field]: 99 }] };
      expect(requestSignature(changed), field).not.toBe(requestSignature(request));
    }
  });

  test("changes when a volume is added", () => {
    const changed = { ...request, volumes: [...request.volumes, request.volumes[0]] };
    expect(requestSignature(changed)).not.toBe(requestSignature(request));
  });

  test("changes with the additional options", () => {
    expect(requestSignature({ ...request, options: { receipt: true, own_hand: false } })).not.toBe(
      requestSignature(request),
    );
    expect(requestSignature({ ...request, options: { receipt: false, own_hand: true } })).not.toBe(
      requestSignature(request),
    );
  });
});

describe("formSignature", () => {
  test("matches the signature of the request the form parses into", () => {
    const parsed = quoteFormSchema.parse(form);
    expect(formSignature(form)).toBe(requestSignature(parsed));
  });

  test("ignores the CEP mask", () => {
    expect(formSignature({ ...form, destinationCep: "01018020" })).toBe(formSignature(form));
  });

  test("ignores how a number was typed", () => {
    const volumes = [{ ...form.volumes[0], weight: "9.45", insurance: "1.215,00" }];
    expect(formSignature({ ...form, volumes })).toBe(formSignature(form));
    expect(formSignature({ ...form, volumes: [{ ...form.volumes[0], weight: "9,450" }] })).toBe(formSignature(form));
  });

  test("changes while a field is being edited", () => {
    const volumes = [{ ...form.volumes[0], weight: "9,4" }];
    expect(formSignature({ ...form, volumes })).not.toBe(formSignature(form));
  });

  test("changes when a volume is removed", () => {
    expect(formSignature({ ...form, volumes: [] })).not.toBe(formSignature(form));
  });

  test("survives empty, partial and unparseable values", () => {
    expect(() => formSignature({})).not.toThrow();
    expect(() => formSignature({ volumes: [{ height: "abc" }] })).not.toThrow();
    expect(formSignature({})).not.toBe(formSignature(form));
  });
});
