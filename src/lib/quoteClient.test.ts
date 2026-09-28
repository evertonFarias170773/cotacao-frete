import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { requestQuote } from "./quoteClient";
import type { QuoteRequest } from "./schemas";

const assign = vi.fn();
const payload: QuoteRequest = {
  originId: "poa",
  destinationCep: "01018020",
  volumes: [{ height: 10, width: 10, length: 10, weight: 1, insurance: 0, quantity: 1 }],
  options: { receipt: false, own_hand: false },
};

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("window", { location: { assign, pathname: "/" } });
});

afterEach(() => vi.unstubAllGlobals());

describe("requestQuote", () => {
  test("a server-side failure keeps the user on the page with its message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Token inválido no servidor." }), { status: 401 })),
    );
    await expect(requestQuote(payload)).rejects.toThrow("Token inválido no servidor.");
    expect(assign).not.toHaveBeenCalled();
  });

  test("a network failure gets the friendly timeout message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(requestQuote(payload)).rejects.toThrow("A cotação demorou demais. Tente novamente.");
  });
});
