import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { NfeXmlError, parseNfeXml } from "./nfeXml";

const XML = readFileSync(new URL("./__fixtures__/nfe-ficticia.xml", import.meta.url), "utf8");
const KEY = "43260946867029000176550010000123451123456780";

describe("parseNfeXml", () => {
  test("reads the key, the invoice number and the issuer", () => {
    const nfe = parseNfeXml(XML);
    expect(nfe.key).toBe(KEY);
    expect(nfe.number).toBe("12345");
    expect(nfe.emitterDocument).toBe("46867029000176");
  });

  test("reads the complete recipient, ready for the contract form", () => {
    expect(parseNfeXml(XML).recipient).toEqual({
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
      postalCode: "01018020",
    });
  });

  test("reads the invoice total and the volumes", () => {
    const nfe = parseNfeXml(XML);
    expect(nfe.totalValue).toBe(1215);
    expect(nfe.volumes).toEqual({ count: 1, grossWeight: 9.45 });
  });

  test("an authorized invoice has no warnings", () => {
    expect(parseNfeXml(XML).warnings).toEqual([]);
  });

  test("a person as recipient comes with the CPF", () => {
    const xml = XML.replace("<CNPJ>11222333000181</CNPJ>", "<CPF>52998224725</CPF>");
    expect(parseNfeXml(xml).recipient.document).toBe("52998224725");
  });

  test("without the SEFAZ protocol, the key comes from infNFe and a warning is raised", () => {
    const xml = XML.replace(/<protNFe[\s\S]*<\/protNFe>/, "");
    const nfe = parseNfeXml(xml);
    expect(nfe.key).toBe(KEY);
    expect(nfe.warnings).toEqual([
      "O XML não traz o protocolo de autorização da SEFAZ. Confira se a nota foi autorizada.",
    ]);
  });

  test("missing phone, e-mail and complement become empty fields to fill in", () => {
    const xml = XML.replace("<fone>1133334444</fone>", "").replace("<email>compras@example.com</email>", "").replace("<xCpl>Sala 2</xCpl>", "");
    const { recipient } = parseNfeXml(xml);
    expect([recipient.phone, recipient.email, recipient.complement]).toEqual(["", "", ""]);
  });

  test("refuses files that are not an NF-e XML", () => {
    expect(() => parseNfeXml("não é xml")).toThrow(NfeXmlError);
    expect(() => parseNfeXml("<html><body>oi</body></html>")).toThrow("O arquivo não é o XML de uma NF-e.");
  });

  test("refuses other fiscal documents, such as the NFC-e (model 65)", () => {
    expect(() => parseNfeXml(XML.replace("<mod>55</mod>", "<mod>65</mod>"))).toThrow(
      "Este XML é de outro documento fiscal (modelo 65). Use o XML da NF-e, modelo 55.",
    );
  });

  test("refuses an invoice the SEFAZ did not authorize", () => {
    const xml = XML.replace("<cStat>100</cStat>", "<cStat>101</cStat>").replace(
      "Autorizado o uso da NF-e",
      "Cancelamento de NF-e homologado",
    );
    expect(() => parseNfeXml(xml)).toThrow("A nota não está autorizada: Cancelamento de NF-e homologado.");
  });

  test("refuses foreign recipients", () => {
    const xml = XML.replace("<CNPJ>11222333000181</CNPJ>", "<idEstrangeiro>AB123</idEstrangeiro>");
    expect(() => parseNfeXml(xml)).toThrow("Destinatário estrangeiro não é suportado.");
  });

  test("refuses a key that does not check out", () => {
    const broken = XML.split(KEY).join(KEY.slice(0, 43) + "1");
    expect(() => parseNfeXml(broken)).toThrow("A chave de acesso do XML é inválida.");
  });
});
