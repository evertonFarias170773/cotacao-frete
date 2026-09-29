import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { Party } from "./cart";
import { parseNfeXml } from "./nfeXml";
import {
  SAME_DOCUMENT_MESSAGE,
  contentSchema,
  contractBlockReason,
  contractRequestSchema,
  recipientFromNfe,
  recipientSchema,
  toRecipientParty,
} from "./recipient";

const recipient = {
  name: "Cliente Destino",
  document: "529.982.247-25",
  phone: "(11) 91234-5678",
  email: "",
  address: "Rua Anita Garibaldi",
  number: "25",
  complement: "sala 2",
  district: "Sé",
  city: "São Paulo",
  stateAbbr: "sp",
};

const MODEL_55_KEY = "1".repeat(20) + "55" + "1".repeat(21) + "8";

const issueFor = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) =>
  result.error?.issues.find((issue) => issue.path.join(".") === field)?.message;

describe("recipientSchema", () => {
  test("accepts a person with CPF and normalises phone and state", () => {
    const parsed = recipientSchema.parse(recipient);
    expect(parsed.phone).toBe("11912345678");
    expect(parsed.stateAbbr).toBe("SP");
  });

  test("accepts companies with numeric or alphanumeric CNPJ", () => {
    expect(recipientSchema.safeParse({ ...recipient, document: "46.867.029/0001-76" }).success).toBe(true);
    expect(recipientSchema.safeParse({ ...recipient, document: "12.ABC.345/01DE-35" }).success).toBe(true);
  });

  test("refuses an invalid document", () => {
    const result = recipientSchema.safeParse({ ...recipient, document: "529.982.247-24" });
    expect(issueFor(result, "document")).toBe("CPF ou CNPJ inválido.");
  });

  test("requires the street number", () => {
    expect(issueFor(recipientSchema.safeParse({ ...recipient, number: " " }), "number")).toBe("Informe o número.");
  });

  test("phone must have 10 or 11 digits with area code", () => {
    expect(recipientSchema.safeParse({ ...recipient, phone: "(51) 3333-4444" }).success).toBe(true);
    expect(issueFor(recipientSchema.safeParse({ ...recipient, phone: "91234-5678" }), "phone")).toBe(
      "Informe o telefone com DDD.",
    );
  });

  test("e-mail is optional but must be valid when given", () => {
    expect(recipientSchema.safeParse({ ...recipient, email: undefined }).success).toBe(true);
    expect(recipientSchema.safeParse({ ...recipient, email: "cliente@example.com" }).success).toBe(true);
    expect(issueFor(recipientSchema.safeParse({ ...recipient, email: "cliente@" }), "email")).toBe("E-mail inválido.");
  });
});

describe("toRecipientParty", () => {
  test("puts a CPF in document and a CNPJ in companyDocument", () => {
    const person = toRecipientParty(recipientSchema.parse(recipient), "01018020");
    expect(person).toMatchObject({ document: "529.982.247-25", postalCode: "01018020" });
    expect(person.companyDocument).toBeUndefined();

    const company = toRecipientParty(recipientSchema.parse({ ...recipient, document: "46.867.029/0001-76" }), "01018020");
    expect(company.companyDocument).toBe("46.867.029/0001-76");
    expect(company.document).toBeUndefined();
  });

  test("drops an empty e-mail and complement", () => {
    const party = toRecipientParty(recipientSchema.parse({ ...recipient, complement: "" }), "01018020");
    expect(party.email).toBeUndefined();
    expect(party.complement).toBeUndefined();
  });
});

describe("contentSchema", () => {
  test("a content declaration needs a description", () => {
    expect(contentSchema.safeParse({ kind: "declaration", description: "Pulseira Tri Band" }).success).toBe(true);
    expect(issueFor(contentSchema.safeParse({ kind: "declaration", description: " " }), "description")).toBe(
      "Descreva o conteúdo.",
    );
  });

  test("an invoice needs a valid model 55 key", () => {
    expect(contentSchema.safeParse({ kind: "invoice", key: MODEL_55_KEY }).success).toBe(true);
    expect(issueFor(contentSchema.safeParse({ kind: "invoice", key: "1".repeat(43) + "2" }), "key")).toBe(
      "Chave da NF-e inválida.",
    );
  });

  test("an invoice keeps the XML text when it came from the file", () => {
    const parsed = contentSchema.parse({ kind: "invoice", key: MODEL_55_KEY, xml: "<nfeProc/>" });
    expect(parsed).toEqual({ kind: "invoice", key: MODEL_55_KEY, xml: "<nfeProc/>" });
  });

  test("refuses an XML larger than any real NF-e", () => {
    const huge = "<a>" + "x".repeat(2 * 1024 * 1024) + "</a>";
    expect(issueFor(contentSchema.safeParse({ kind: "invoice", key: MODEL_55_KEY, xml: huge }), "xml")).toBe(
      "XML grande demais para uma NF-e.",
    );
  });
});

describe("contractRequestSchema", () => {
  test("carries the quote, the chosen service, the recipient and the content", () => {
    const parsed = contractRequestSchema.parse({
      quote: {
        originId: "poa",
        destinationCep: "01018-020",
        volumes: [{ height: 21.6, width: 22, length: 32, weight: 9.45, insurance: 1215, quantity: 2 }],
        options: { receipt: false, own_hand: false },
      },
      serviceId: 1,
      recipient,
      content: { kind: "declaration", description: "Pulseira Tri Band" },
      agencyId: 5692,
    });
    expect(parsed.quote.destinationCep).toBe("01018020");
    expect(parsed.agencyId).toBe(5692);
  });
});

describe("contractBlockReason (transfer between the company's own units)", () => {
  const sender: Party = {
    name: "Empresa",
    phone: "5133334444",
    companyDocument: "46.867.029/0001-76",
    address: "Rua",
    number: "1",
    district: "Centro",
    city: "Porto Alegre",
    postalCode: "90660130",
    stateAbbr: "RS",
  };
  const sameCompany: Party = { ...sender, companyDocument: "46867029000176", city: "Santa Cruz do Sul" };
  const otherPerson: Party = { ...sender, companyDocument: undefined, document: "52998224725" };

  test("Total Express refuses the same CNPJ on both ends", () => {
    expect(contractBlockReason(35, sender, sameCompany)).toBe(SAME_DOCUMENT_MESSAGE);
  });

  test("other carriers and other recipients are not blocked", () => {
    expect(contractBlockReason(1, sender, sameCompany)).toBeNull();
    expect(contractBlockReason(35, sender, otherPerson)).toBeNull();
  });
});

describe("recipientFromNfe", () => {
  test("fills every recipient field from the invoice", () => {
    const nfe = parseNfeXml(readFileSync(new URL("./__fixtures__/nfe-ficticia.xml", import.meta.url), "utf8"));
    expect(recipientFromNfe(nfe.recipient)).toEqual({
      name: "Cliente Ficticio Comercio LTDA",
      document: "11222333000181",
      phone: "1133334444",
      email: "compras@example.com",
      address: "Rua Anita Garibaldi",
      number: "25",
      complement: "Sala 2",
      district: "Se",
      city: "Sao Paulo",
      stateAbbr: "SP",
    });
  });
});

describe("contractRequestSchema vibeOrder", () => {
  test.each([0, -1, 1.5, 1_000_000_000])("refuses %s as a Vibe order", (vibeOrder) => {
    expect(contractRequestSchema.shape.vibeOrder.safeParse(vibeOrder).success).toBe(false);
  });

  test("is optional", () => {
    expect(contractRequestSchema.shape.vibeOrder.safeParse(undefined).success).toBe(true);
  });
});
