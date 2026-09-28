import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeMelhorEnvio, fixture, jsonResponse } from "@/test/meFetch";
import { authedRequest, useTestSession } from "@/test/session";
import { GET } from "./route";

const URL = "http://localhost/api/shipments";

beforeEach(() => {
  useTestSession();
  vi.stubEnv("MELHOR_ENVIO_TOKEN", "token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/shipments", () => {
  test("lists a page of shipments filtered by status", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "GET", path: /\/orders\?/, reply: () => jsonResponse(200, { ...fixture<object>("orders-list"), last_page: 1 }) },
    ]);
    const response = await GET(await authedRequest(`${URL}?page=1&status=delivered`));
    expect(response.status).toBe(200);
    expect(calls[0].path).toBe("/api/v2/me/orders?page=1&status=delivered");
    expect(((await response.json()) as { items: unknown[] }).items.length).toBeGreaterThan(0);
  });

  test("view=cart lists what waits for payment", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, fixture("cart-list")) },
    ]);
    const response = await GET(await authedRequest(`${URL}?view=cart`));
    expect(((await response.json()) as { items: unknown[] }).items).toHaveLength(2);
    expect(calls[0].path).toBe("/api/v2/me/cart?page=1");
  });

  test("refuses an unknown status or page", async () => {
    const { calls } = fakeMelhorEnvio([]);
    expect((await GET(await authedRequest(`${URL}?page=1&status=hacked`))).status).toBe(400);
    expect((await GET(await authedRequest(`${URL}?page=0`))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("requires a session", async () => {
    expect((await GET(new Request(`${URL}?page=1`))).status).toBe(401);
  });
});
