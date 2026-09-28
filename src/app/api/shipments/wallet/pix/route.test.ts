import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeMelhorEnvio, fixture, jsonResponse } from "@/test/meFetch";
import { authedRequest, jsonBody, useTestSession } from "@/test/session";
import { GET, POST } from "./route";

const URL = "http://localhost/api/shipments/wallet/pix";
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

describe("POST /api/shipments/wallet/pix", () => {
  test("computes the amount on the server and ignores any value sent by the browser", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "GET", path: /\/balance$/, reply: () => jsonResponse(200, { balance: 0 }) },
      { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, { ...cartList, last_page: 1 }) },
      { method: "POST", path: /\/balance$/, reply: () => jsonResponse(200, fixture("pix-create")) },
    ]);
    const response = await POST(await authedRequest(URL, jsonBody({ orders, value: 0.01 })));

    expect(response.status).toBe(200);
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ value: "137.66" });
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["amount", "copyPaste", "expiresAt", "paymentId", "qrCodeUrl"]);
  });

  test("requires a session", async () => {
    const { calls } = fakeMelhorEnvio([]);
    expect((await POST(new Request(URL, jsonBody({ orders })))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe("GET /api/shipments/wallet/pix", () => {
  test("answers the payment status", async () => {
    fakeMelhorEnvio([{ method: "GET", path: /\/payments\//, reply: () => jsonResponse(200, fixture("payment-pending")) }]);
    const response = await GET(await authedRequest(`${URL}?id=a2db3a3b-0000-4000-8000-000000000001`));
    expect(await response.json()).toEqual({ status: "pending" });
  });

  test("refuses an id that is not a payment id", async () => {
    const { calls } = fakeMelhorEnvio([]);
    const response = await GET(await authedRequest(`${URL}?id=../orders`));
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
