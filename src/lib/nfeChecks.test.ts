import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { compareNfeWithQuote } from "./nfeChecks";
import { parseNfeXml } from "./nfeXml";

const nbsp = (s: string) => s.replace(/ /g, " ");
const nfe = parseNfeXml(readFileSync(new URL("./__fixtures__/nfe-ficticia.xml", import.meta.url), "utf8"));

describe("compareNfeWithQuote", () => {
  test("an invoice matching the quote passes clean", () => {
    expect(compareNfeWithQuote(nfe, { destinationCep: "01018020", declaredValue: 1215 })).toEqual({
      blocking: null,
      warnings: [],
    });
  });

  test("a different CEP blocks: the quoted price would not apply to that address", () => {
    const result = compareNfeWithQuote(nfe, { destinationCep: "90010000", declaredValue: 1215 });
    expect(nbsp(result.blocking ?? "")).toBe(
      "O CEP da nota (01018-020) é diferente do CEP cotado (90010-000). Faça uma nova cotação para o CEP da nota.",
    );
  });

  test("a different value only warns, and says which value insures the shipment", () => {
    const result = compareNfeWithQuote(nfe, { destinationCep: "01018020", declaredValue: 1000 });
    expect(result.blocking).toBeNull();
    expect(result.warnings.map(nbsp)).toEqual([
      "O valor da nota (R$ 1.215,00) é diferente do valor declarado na cotação (R$ 1.000,00). O seguro usa o valor da cotação.",
    ]);
  });

  test("ignores rounding below one cent", () => {
    expect(compareNfeWithQuote(nfe, { destinationCep: "01018020", declaredValue: 1215.004 }).warnings).toEqual([]);
  });

  test("passes on the XML's own warnings", () => {
    const unsigned = { ...nfe, warnings: ["Sem protocolo."] };
    expect(compareNfeWithQuote(unsigned, { destinationCep: "01018020", declaredValue: 1215 }).warnings).toEqual([
      "Sem protocolo.",
    ]);
  });
});
