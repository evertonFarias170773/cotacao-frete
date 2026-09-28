import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeMelhorEnvio, jsonResponse } from "@/test/meFetch";
import { authedRequest, jsonBody, useTestSession } from "@/test/session";
import { GET, POST } from "./route";

const URL = "http://localhost/api/shipments/labels";
const A = "a2db3844-f23e-4367-b6cf-02fb76413df5";

beforeEach(() => {
  useTestSession();
  vi.stubEnv("MELHOR_ENVIO_TOKEN", "token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/api/shipments/labels", () => {
  test("POST generates and answers per order", async () => {
    fakeMelhorEnvio([
      { method: "POST", path: /\/shipment\/generate$/, reply: () => jsonResponse(200, { [A]: { status: true, message: "ok" } }) },
    ]);
    const response = await POST(await authedRequest(URL, jsonBody({ orders: [A] })));
    expect(await response.json()).toEqual({ results: [{ id: A, ok: true, message: "ok" }] });
  });

  test("GET reads the status of the listed orders", async () => {
    fakeMelhorEnvio([
      { method: "GET", path: /\/orders\//, reply: () => jsonResponse(200, { id: A, status: "released", generated_at: null }) },
    ]);
    const response = await GET(await authedRequest(`${URL}?orders=${A}`));
    expect(await response.json()).toEqual({ labels: [{ id: A, status: "released", generated: false, tracking: null }] });
  });

  test("GET refuses anything that is not an order id", async () => {
    const { calls } = fakeMelhorEnvio([]);
    expect((await GET(await authedRequest(`${URL}?orders=../balance`))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("both require a session", async () => {
    expect((await POST(new Request(URL, jsonBody({ orders: [A] })))).status).toBe(401);
    expect((await GET(new Request(`${URL}?orders=${A}`))).status).toBe(401);
  });
});
