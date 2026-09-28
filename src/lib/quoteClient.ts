import { ApiError, callApi } from "./apiClient";
import type { QuoteRequest } from "./schemas";
import type { QuoteResult } from "./types";

const NETWORK_MESSAGE = "A cotação demorou demais. Tente novamente.";

/** Calls the internal /api/quote route. Throws an Error with a user-facing message. */
export async function requestQuote(payload: QuoteRequest): Promise<QuoteResult> {
  try {
    return await callApi<QuoteResult>("/api/quote", { method: "POST", body: payload });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(NETWORK_MESSAGE);
  }
}
