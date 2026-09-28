import { afterEach, describe, expect, test, vi } from "vitest";
import { SenderConfigError, getSender, parseSenders } from "./senders";

const poa = {
  name: "Empresa Ficticia LTDA",
  phone: "(51) 3333-4444",
  email: "expedicao@example.com",
  companyDocument: "46.867.029/0001-76",
  stateRegister: "1234567890",
  economicActivityCode: "4687701",
  address: "Rua do Remetente",
  number: "81",
  district: "Medianeira",
  city: "Porto Alegre",
  postalCode: "90660-130",
  stateAbbr: "RS",
};
const scs = { ...poa, address: "Travessa Ficticia", number: "39", district: "Centro", city: "Santa Cruz do Sul", postalCode: "96810-400" };

describe("parseSenders", () => {
  test("reads both origins from the JSON", () => {
    const senders = parseSenders(JSON.stringify({ poa, scs }));
    expect(senders.poa.city).toBe("Porto Alegre");
    expect(senders.scs.postalCode).toBe("96810-400");
  });

  test("fails with a clear message when the variable is missing or not JSON", () => {
    expect(() => parseSenders(undefined)).toThrow(SenderConfigError);
    expect(() => parseSenders(undefined)).toThrow("Dados do remetente não configurados no servidor (SENDERS_JSON).");
    expect(() => parseSenders("{nao json")).toThrow(SenderConfigError);
  });

  test("requires both origins", () => {
    expect(() => parseSenders(JSON.stringify({ poa }))).toThrow(SenderConfigError);
  });

  test("refuses a sender whose CEP is not the origin's CEP", () => {
    expect(() => parseSenders(JSON.stringify({ poa: { ...poa, postalCode: "01018-020" }, scs }))).toThrow(
      "O CEP do remetente poa não bate com a origem cadastrada no app.",
    );
  });

  test("refuses an invalid or missing document", () => {
    expect(() => parseSenders(JSON.stringify({ poa: { ...poa, companyDocument: "46.867.029/0001-77" }, scs }))).toThrow(
      SenderConfigError,
    );
    const { companyDocument, ...withoutDocument } = poa;
    void companyDocument;
    expect(() => parseSenders(JSON.stringify({ poa: withoutDocument, scs }))).toThrow(SenderConfigError);
  });

  test("refuses missing mandatory address fields", () => {
    expect(() => parseSenders(JSON.stringify({ poa: { ...poa, number: "" }, scs }))).toThrow(SenderConfigError);
  });
});

describe("getSender", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("resolves the sender of an origin from SENDERS_JSON", () => {
    vi.stubEnv("SENDERS_JSON", JSON.stringify({ poa, scs }));
    expect(getSender("scs").city).toBe("Santa Cruz do Sul");
  });
});
