import type { QuoteRequest } from "./schemas";
import type { QuoteResult } from "./types";

const NETWORK_MESSAGE = "A cotação demorou demais. Tente novamente.";

/** Calls the internal /api/quote route. Throws an Error with a user-facing message. */
export async function requestQuote(payload: QuoteRequest): Promise<QuoteResult> {
  let response: Response;
  try {
    response = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(NETWORK_MESSAGE);
  }

  const body = (await response.json().catch(() => null)) as { error?: string } | QuoteResult | null;
  if (!response.ok) {
    const message = body && "error" in body && typeof body.error === "string" ? body.error : null;
    throw new Error(message ?? "Não foi possível cotar agora. Tente novamente.");
  }
  return body as QuoteResult;
}
