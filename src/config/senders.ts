import "server-only";
import { z } from "zod";
import type { Party } from "@/lib/cart";
import { isValidCnpj, isValidCpf } from "@/lib/documents";
import { onlyDigits } from "@/lib/format";
import { ORIGINS, type OriginId } from "./origins";

/**
 * Full sender data per origin. It lives in the SENDERS_JSON environment variable, not in the code,
 * because the repository is public: {"poa": Party, "scs": Party}.
 */
export class SenderConfigError extends Error {}

const text = z.string().trim().min(1);
const optionalText = z.string().trim().optional();

const partySchema = z
  .object({
    name: text,
    phone: text,
    email: optionalText,
    document: optionalText,
    companyDocument: optionalText,
    stateRegister: optionalText,
    economicActivityCode: optionalText,
    address: text,
    number: text,
    complement: optionalText,
    district: text,
    city: text,
    postalCode: text,
    stateAbbr: z.string().trim().length(2),
  })
  .refine(
    (party) =>
      party.companyDocument ? isValidCnpj(party.companyDocument) : Boolean(party.document && isValidCpf(party.document)),
    { error: "CPF ou CNPJ do remetente inválido." },
  );

const sendersSchema = z.object({ poa: partySchema, scs: partySchema });

export function parseSenders(raw: string | undefined): Record<OriginId, Party> {
  if (!raw?.trim()) throw new SenderConfigError("Dados do remetente não configurados no servidor (SENDERS_JSON).");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new SenderConfigError("SENDERS_JSON não é um JSON válido.");
  }
  const parsed = sendersSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SenderConfigError(`SENDERS_JSON inválido em ${issue.path.join(".")}: ${issue.message}`);
  }
  for (const origin of ORIGINS) {
    if (onlyDigits(parsed.data[origin.id].postalCode) !== origin.cep) {
      throw new SenderConfigError(`O CEP do remetente ${origin.id} não bate com a origem cadastrada no app.`);
    }
  }
  return parsed.data;
}

export function getSender(origin: OriginId): Party {
  return parseSenders(process.env.SENDERS_JSON)[origin];
}
