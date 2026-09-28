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
    const response = await POST(await authedRequest(URL, jsonBody({ orders })));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Saldo insuficiente.", pix: 137.66 });
  });

  test("paid orders answer 200", async () => {
    fakeMelhorEnvio([
      { method: "GET", path: /\/balance$/, reply: () => jsonResponse(200, { balance: 500 }) },
      { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, { ...cartList, last_page: 1 }) },
      { method: "POST", path: /\/shipment\/checkout$/, reply: () => jsonResponse(200, fixture("checkout")) },
    ]);
    const response = await POST(await authedRequest(URL, jsonBody({ orders })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "paid", protocol: "PUR-202609144989" });
  });

  test("requires a session", async () => {
    const { calls } = fakeMelhorEnvio([]);
    expect((await POST(new Request(URL, jsonBody({ orders })))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});
