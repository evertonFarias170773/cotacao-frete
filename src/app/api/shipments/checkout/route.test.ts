import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeMelhorEnvio, fixture, jsonResponse } from "@/test/meFetch";
import { authedRequest, jsonBody, useTestSession } from "@/test/session";
import { POST } from "./route";

const URL = "http://localhost/api/shipments/checkout";
const cartList = fixture<{ data: { id: string }[] }>("cart-list");
const orders = cartList.data.map((order) => order.id);

beforeEach(() => {
  useTestSession();
  vi.stubEnv("MELHOR_ENVIO_TOKEN", "token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/shipments/checkout", () => {
  test("insufficient balance answers 409 with the PIX amount", async () => {
    fakeMelhorEnvio([
      { method: "GET", path: /\/balance$/, reply: () => jsonResponse(200, { balance: 0 }) },
      { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, { ...cartList, last_page: 1 }) },
    ]);
    const response = await POST(await authedRequest(URL, jsonBody({ orders, expectedTotal: 137.66 })));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Saldo insuficiente.", pix: 137.66 });
  });

  test("paid orders answer 200", async () => {
    fakeMelhorEnvio([
      { method: "GET", path: /\/balance$/, reply: () => jsonResponse(200, { balance: 500 }) },
      { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, { ...cartList, last_page: 1 }) },
      { method: "POST", path: /\/shipment\/checkout$/, reply: () => jsonResponse(200, fixture("checkout")) },
    ]);
    const response = await POST(await authedRequest(URL, jsonBody({ orders, expectedTotal: 137.66 })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "paid", protocol: "PUR-202609144989" });
  });

  test("a changed cart price answers 409 with the new total", async () => {
    fakeMelhorEnvio([
      { method: "GET", path: /\/balance$/, reply: () => jsonResponse(200, { balance: 500 }) },
      { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, { ...cartList, last_page: 1 }) },
    ]);
    const response = await POST(await authedRequest(URL, jsonBody({ orders, expectedTotal: 100 })));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "O preço mudou para R$ 137,66. Confira antes de pagar.", total: 137.66 });
  });

  test("the price the user saw is required", async () => {
    const { calls } = fakeMelhorEnvio([]);
    expect((await POST(await authedRequest(URL, jsonBody({ orders })))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("requires a session", async () => {
    const { calls } = fakeMelhorEnvio([]);
    expect((await POST(new Request(URL, jsonBody({ orders, expectedTotal: 137.66 })))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});
