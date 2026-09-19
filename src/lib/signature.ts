import { onlyDigits, parseDecimal } from "./format";
import type { QuoteRequest, VolumeFormInput } from "./schemas";

/**
 * Fingerprint of everything that changes a freight quote. Two equivalent inputs always
 * produce the same string, so a displayed quote can be told apart from a stale one.
 */

type FormLike = {
  originId?: string;
  destinationCep?: string;
  volumes?: (Partial<VolumeFormInput> | undefined)[];
  options?: { receipt?: boolean; own_hand?: boolean };
};

function build(
  originId: string,
  cep: string,
  volumes: string[],
  receipt: boolean,
  ownHand: boolean,
): string {
  return [originId, cep, volumes.join("|"), receipt ? "1" : "0", ownHand ? "1" : "0"].join("~");
}

export function requestSignature(request: QuoteRequest): string {
  return build(
    request.originId,
    request.destinationCep,
    request.volumes.map((volume) =>
      [volume.height, volume.width, volume.length, volume.weight, volume.insurance, volume.quantity]
        .map(String)
        .join("x"),
    ),
    request.options.receipt,
    request.options.own_hand,
  );
}

/** Same fingerprint taken from the raw form fields, so it can be compared while the user types. */
export function formSignature(values: FormLike | undefined): string {
  const form = values ?? {};
  return build(
    form.originId ?? "",
    onlyDigits(form.destinationCep ?? ""),
    (form.volumes ?? []).map((volume) =>
      [volume?.height, volume?.width, volume?.length, volume?.weight, volume?.insurance, volume?.quantity]
        .map(canonical)
        .join("x"),
    ),
    Boolean(form.options?.receipt),
    Boolean(form.options?.own_hand),
  );
}

/** "9,450" and "9.45" mean the same number; anything unparseable keeps its raw text. */
function canonical(field: string | undefined): string {
  const text = field ?? "";
  const parsed = parseDecimal(text);
  return parsed === null ? text.trim() : String(parsed);
}
