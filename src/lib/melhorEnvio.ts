import "server-only";
import { QuoteError, mapApiError } from "./errors";
import { normalizeQuoteResponse } from "./normalize";
import { buildProductsPayload, buildVolumesPayload, wantsProductsMode } from "./payload";
import type { QuoteRequest } from "./schemas";
import type { QuoteResult } from "./types";

const BASE_URLS = {
  production: "https://melhorenvio.com.br",
  sandbox: "https://sandbox.melhorenvio.com.br",
} as const;

const CALCULATE_PATH = "/api/v2/me/shipment/calculate";
const DEFAULT_TIMEOUT_MS = 15_000;
const TIMEOUT_MESSAGE = "A cotação demorou demais. Tente novamente.";

type Config = { token: string; baseUrl: string; userAgent: string };

const APP_NAME = "Cotador de Fretes";

/** The API requires "Application (contact e-mail)"; accept a bare e-mail and complete the format. */
function userAgentFrom(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return `${APP_NAME} (contato@empresa.com.br)`;
  return /^[^\s()]+@[^\s()]+$/.test(trimmed) ? `${APP_NAME} (${trimmed})` : trimmed;
}

function getConfig(): Config {
  const token = process.env.MELHOR_ENVIO_TOKEN?.trim();
  if (!token) throw new QuoteError(500, "Token do Melhor Envio não configurado no servidor.");
  const env = process.env.MELHOR_ENVIO_ENV?.trim();
  return {
    token,
    baseUrl: env === "sandbox" ? BASE_URLS.sandbox : BASE_URLS.production,
    userAgent: userAgentFrom(process.env.MELHOR_ENVIO_USER_AGENT),
  };
}

async function post(
  config: Config,
  payload: unknown,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${CALCULATE_PATH}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
        "User-Agent": config.userAgent,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  } catch {
    // Abort (timeout) or network failure: never surface internals to the caller.
    throw new QuoteError(504, TIMEOUT_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Quotes a shipment on Melhor Envio. Tries the `volumes` mode first and falls back
 * to `products` once if the API rejects volumes with a 422.
 */
export async function quoteShipment(
  request: QuoteRequest,
  options: { timeoutMs?: number } = {},
): Promise<QuoteResult> {
  const config = getConfig();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let result = await post(config, buildVolumesPayload(request), timeoutMs);
  if (result.status === 422 && wantsProductsMode(result.body)) {
    result = await post(config, buildProductsPayload(request), timeoutMs);
  }
  if (result.status < 200 || result.status >= 300) {
    throw mapApiError(result.status, result.body);
  }

  try {
    return normalizeQuoteResponse(result.body);
  } catch {
    throw new QuoteError(502, "Resposta inesperada do Melhor Envio.");
  }
}
