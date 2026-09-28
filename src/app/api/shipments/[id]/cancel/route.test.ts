import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeMelhorEnvio, jsonResponse } from "@/test/meFetch";
import { authedRequest, useTestSession } from "@/test/session";
import { POST } from "./route";

const ORDER = "a2db3845-d38f-4fbd-a233-26d4314c7810";
const url = (id: string) => `http://localhost/api/shipments/${id}/cancel`;
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  useTestSession();
  vi.stubEnv("MELHOR_ENVIO_TOKEN", "token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/shipments/[id]/cancel", () => {
  test("requests the cancellation", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "POST", path: /\/shipment\/cancel$/, reply: () => jsonResponse(200, { [ORDER]: { canceled: true, status: "pending" } }) },
    ]);
    const response = await POST(await authedRequest(url(ORDER), { method: "POST" }), context(ORDER));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect((calls[0].body as { order: { id: string } }).order.id).toBe(ORDER);
  });

  test("refuses an id that is not a UUID", async () => {
    const { calls } = fakeMelhorEnvio([]);
    const response = await POST(await authedRequest(url("abc"), { method: "POST" }), context("abc"));
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("requires a session", async () => {
    const { calls } = fakeMelhorEnvio([]);
    expect((await POST(new Request(url(ORDER), { method: "POST" }), context(ORDER))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});
