import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { QuoteError } from "./errors";
import { NOT_WEIGHED } from "./vibe";
import { VIBE_UNAVAILABLE, fetchVibeOrder, vibeConfigured } from "./vibeClient";
import raw from "./__fixtures__/vibe-pedido.json";

const KEY = "chave-de-teste-123";

function stubFetch(reply: () => Response | Promise<Response>) {
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: new Headers(init.headers) });
      return reply();
    }),
  );
  return calls;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function failure(promise: Promise<unknown>): Promise<QuoteError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof QuoteError) return error;
    throw error;
  }
  throw new Error("expected a QuoteError");
}

beforeEach(() => {
  vi.stubEnv("VIBE_API_URL", "https://vibe.example.com/api/v1/cliente/pedidos/");
  vi.stubEnv("VIBE_API_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("vibeConfigured", () => {
  test("needs both the address and the key", () => {
    expect(vibeConfigured()).toBe(true);
    vi.stubEnv("VIBE_API_KEY", "  ");
    expect(vibeConfigured()).toBe(false);
  });
});

describe("fetchVibeOrder", () => {
  test("asks the Vibe for the order with the key header and returns the reduced order", async () => {
    const calls = stubFetch(() => json(200, raw));
    const order = await fetchVibeOrder(22773);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://vibe.example.com/api/v1/cliente/pedidos/22773");
    expect(calls[0].headers.get("x-api-key")).toBe(KEY);
    expect(order.id).toBe(22773);
    expect(JSON.stringify(order)).not.toContain("PAGADOR");
  });

  test("not configured: 503 without calling anyone", async () => {
    vi.stubEnv("VIBE_API_URL", "");
    const calls = stubFetch(() => json(200, raw));
    const error = await failure(fetchVibeOrder(1));
    expect(error.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  test.each([
    [404, 404, "Pedido não encontrado."],
    [429, 429, "Muitas consultas seguidas. Espere 1 minuto."],
    [401, 502, "O Vibe recusou a chave de acesso. Confira a configuração."],
    [500, 502, VIBE_UNAVAILABLE],
  ])("Vibe HTTP %i becomes %i with a readable message", async (vibeStatus, status, message) => {
    stubFetch(() => json(vibeStatus, { erro: "x", mensagem: "y" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = await failure(fetchVibeOrder(22773));
    expect(error.status).toBe(status);
    expect(error.message).toBe(message);
  });

  test("a network failure or timeout gives the unavailable message", async () => {
    stubFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = await failure(fetchVibeOrder(22773));
    expect(error.status).toBe(502);
    expect(error.message).toBe(VIBE_UNAVAILABLE);
  });

  test("an unexpected body gives the unavailable message", async () => {
    stubFetch(() => json(200, { algo: "diferente" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await failure(fetchVibeOrder(22773))).message).toBe(VIBE_UNAVAILABLE);
  });

  test("an order not weighed yet keeps its own message", async () => {
    stubFetch(() => json(200, { ...raw, peso_aferido_kg: null }));
    const error = await failure(fetchVibeOrder(22773));
    expect(error.status).toBe(422);
    expect(error.message).toBe(NOT_WEIGHED);
  });

  test("logs carry the order number, never the key or personal data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubFetch(() => json(401, {}));
    await failure(fetchVibeOrder(22773));
    stubFetch(() => json(200, { ...raw, entrega: "quebrado" }));
    await failure(fetchVibeOrder(22773));
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("22773");
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("CLIENTE");
  });
});
