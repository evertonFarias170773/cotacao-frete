import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { authedRequest, useTestSession } from "@/test/session";
import raw from "@/lib/__fixtures__/vibe-pedido.json";
import { GET } from "./route";

const KEY = "chave-de-teste-123";
const url = (id: string) => `http://localhost/api/vibe/orders/${id}`;
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function stubVibe(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useTestSession();
  vi.stubEnv("VIBE_API_URL", "https://vibe.example.com/pedidos");
  vi.stubEnv("VIBE_API_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/vibe/orders/[id]", () => {
  test("returns the reduced order, without the payer or the key", async () => {
    stubVibe(200, raw);
    const response = await GET(await authedRequest(url("22773")), context("22773"));
    expect(response.status).toBe(200);
    const text = await response.text();
    const { order } = JSON.parse(text) as { order: { id: number; boxes: unknown[] } };
    expect(order.id).toBe(22773);
    expect(order.boxes).toHaveLength(1);
    expect(text).not.toContain("PAGADOR");
    expect(text).not.toContain("valor_total");
    expect(text).not.toContain(KEY);
  });

  test("requires a session and does not call the Vibe without one", async () => {
    const fetchMock = stubVibe(200, raw);
    expect((await GET(new Request(url("22773")), context("22773"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(["abc", "0", "1234567890", "12.3", "-5"])("refuses %s as an order number", async (id) => {
    const fetchMock = stubVibe(200, raw);
    const response = await GET(await authedRequest(url(id)), context(id));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Informe o número do pedido." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an unknown order answers 404 with the message", async () => {
    stubVibe(404, { erro: "nao_encontrado", mensagem: "Pedido não encontrado." });
    const response = await GET(await authedRequest(url("1")), context("1"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Pedido não encontrado." });
  });

  test("without configuration answers 503", async () => {
    vi.stubEnv("VIBE_API_KEY", "");
    stubVibe(200, raw);
    expect((await GET(await authedRequest(url("1")), context("1"))).status).toBe(503);
  });
});
