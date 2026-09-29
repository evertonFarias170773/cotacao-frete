import "server-only";
import { QuoteError } from "./errors";
import { toVibeOrder, vibeResponseSchema, type VibeOrder } from "./vibe";

const TIMEOUT_MS = 10_000;

export const VIBE_UNAVAILABLE = "Não foi possível falar com o Vibe agora.";

/** VIBE_API_URL is the full address up to /pedidos, so no client name lives in the code. */
function vibeConfig(): { url: string; key: string } | null {
  const url = process.env.VIBE_API_URL?.trim().replace(/\/+$/, "");
  const key = process.env.VIBE_API_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function vibeConfigured(): boolean {
  return vibeConfig() !== null;
}

/** Logs only the order number and what went wrong: never the key, names or addresses. */
function logFailure(id: number, reason: string) {
  console.error(`[vibe] pedido ${id}: ${reason}`);
}

async function getJson(url: string, key: string): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "x-api-key": key },
      signal: controller.signal,
      cache: "no-store",
    });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One order from the Vibe, reduced to what the quote and the label need. Read-only. */
export async function fetchVibeOrder(id: number): Promise<VibeOrder> {
  const config = vibeConfig();
  if (!config) throw new QuoteError(503, "A integração com o Vibe não está configurada.");

  const response = await getJson(`${config.url}/${id}`, config.key);
  if (!response) {
    logFailure(id, "sem resposta");
    throw new QuoteError(502, VIBE_UNAVAILABLE);
  }
  if (response.status === 404) throw new QuoteError(404, "Pedido não encontrado.");
  if (response.status === 429) throw new QuoteError(429, "Muitas consultas seguidas. Espere 1 minuto.");
  if (response.status === 401) {
    logFailure(id, "chave recusada");
    throw new QuoteError(502, "O Vibe recusou a chave de acesso. Confira a configuração.");
  }
  if (response.status < 200 || response.status >= 300) {
    logFailure(id, `HTTP ${response.status}`);
    throw new QuoteError(502, VIBE_UNAVAILABLE);
  }

  const parsed = vibeResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    logFailure(id, "resposta inesperada");
    throw new QuoteError(502, VIBE_UNAVAILABLE);
  }
  return toVibeOrder(parsed.data);
}
