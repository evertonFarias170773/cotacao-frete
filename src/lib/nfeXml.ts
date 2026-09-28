import { XMLParser } from "fast-xml-parser";
import { normalizeDocument } from "./documents";
import { onlyDigits } from "./format";
import { isValidNfeKey } from "./nfe";

/**
 * Reads an NF-e XML (layout 4.00, with or without the SEFAZ protocol) in the browser, so the
 * contract screen can fill the recipient and the access key. The file never leaves the device.
 */
export class NfeXmlError extends Error {}

export type NfeRecipient = {
  name: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  stateAbbr: string;
  postalCode: string;
};

export type NfeData = {
  key: string;
  number: string;
  emitterDocument: string;
  recipient: NfeRecipient;
  totalValue: number;
  volumes?: { count: number; grossWeight?: number };
  warnings: string[];
};

const NOT_NFE = "O arquivo não é o XML de uma NF-e.";
const AUTHORIZED = new Set(["100", "150"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // Everything stays text: CEPs, CPFs and keys have leading zeros.
  parseTagValue: false,
  parseAttributeValue: false,
});

type XmlNode = Record<string, unknown>;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
const node = (value: unknown): XmlNode | undefined => {
  const first = asArray(value)[0];
  return first && typeof first === "object" ? (first as XmlNode) : undefined;
};
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const decimal = (value: unknown): number | undefined => {
  const parsed = Number(text(value));
  return text(value) && Number.isFinite(parsed) ? parsed : undefined;
};

export function parseNfeXml(xml: string): NfeData {
  let root: XmlNode;
  try {
    root = parser.parse(xml) as XmlNode;
  } catch {
    throw new NfeXmlError(NOT_NFE);
  }
  const proc = node(root.nfeProc);
  const info = node(node(proc?.NFe ?? root.NFe)?.infNFe);
  if (!info) throw new NfeXmlError(NOT_NFE);

  const model = text(node(info.ide)?.mod);
  if (model && model !== "55") {
    throw new NfeXmlError(`Este XML é de outro documento fiscal (modelo ${model}). Use o XML da NF-e, modelo 55.`);
  }

  const warnings: string[] = [];
  const protocol = node(node(proc?.protNFe)?.infProt);
  if (protocol) {
    const status = text(protocol.cStat);
    if (status && !AUTHORIZED.has(status)) {
      throw new NfeXmlError(`A nota não está autorizada: ${text(protocol.xMotivo) || `situação ${status}`}.`);
    }
  } else {
    warnings.push("O XML não traz o protocolo de autorização da SEFAZ. Confira se a nota foi autorizada.");
  }

  const key = onlyDigits(text(protocol?.chNFe) || text(info["@_Id"]).replace(/^NFe/, ""));
  if (!isValidNfeKey(key)) throw new NfeXmlError("A chave de acesso do XML é inválida.");

  const dest = node(info.dest);
  if (!dest) throw new NfeXmlError("A nota não tem destinatário.");
  if (dest.idEstrangeiro !== undefined) throw new NfeXmlError("Destinatário estrangeiro não é suportado.");
  const address = node(dest.enderDest);
  const emitter = node(info.emit);

  const volumes = asArray(node(info.transp)?.vol).map((vol) => node(vol) ?? {});
  const count = volumes.reduce((sum, vol) => sum + (decimal(vol.qVol) ?? 0), 0);
  const weights = volumes.map((vol) => decimal(vol.pesoB)).filter((w): w is number => w !== undefined);

  return {
    key,
    number: text(node(info.ide)?.nNF),
    emitterDocument: normalizeDocument(text(emitter?.CNPJ) || text(emitter?.CPF)),
    recipient: {
      name: text(dest.xNome),
      document: normalizeDocument(text(dest.CNPJ) || text(dest.CPF)),
      phone: onlyDigits(text(address?.fone)),
      email: text(dest.email),
      address: text(address?.xLgr),
      number: text(address?.nro),
      complement: text(address?.xCpl),
      district: text(address?.xBairro),
      city: text(address?.xMun),
      stateAbbr: text(address?.UF).toUpperCase(),
      postalCode: onlyDigits(text(address?.CEP)),
    },
    totalValue: decimal(node(node(info.total)?.ICMSTot)?.vNF) ?? 0,
    ...(count > 0
      ? { volumes: { count, ...(weights.length ? { grossWeight: weights.reduce((a, b) => a + b, 0) } : {}) } }
      : {}),
    warnings,
  };
}
