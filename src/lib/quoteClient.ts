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

  if (response.status === 401) {
    // Session expired: back to the login page, returning here afterwards.
    // Plain module, no router here; a full navigation also lets the proxy re-check the cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/entrar?para=${encodeURIComponent(window.location.pathname)}`);
  }

  const body = (await response.json().catch(() => null)) as { error?: string } | QuoteResult | null;
  if (!response.ok) {
    const message = body && "error" in body && typeof body.error === "string" ? body.error : null;
    throw new Error(message ?? "Não foi possível cotar agora. Tente novamente.");
  }
  return body as QuoteResult;
}
