import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError, callApi } from "./apiClient";
import { UNAUTHENTICATED_MESSAGE } from "./sessionConfig";

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("window", { location: { assign, pathname: "/envios" } });
});

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("callApi", () => {
  test("an expired session sends the user to the login page", async () => {
    reply(401, { error: UNAUTHENTICATED_MESSAGE });
    await expect(callApi("/api/shipments")).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/entrar?para=%2Fenvios");
  });

  test("any other failure stays on the page with its message", async () => {
    reply(502, { error: "Não foi possível autenticar no Melhor Envio. Verifique o token." });
    await expect(callApi("/api/shipments")).rejects.toMatchObject({
      status: 502,
      message: "Não foi possível autenticar no Melhor Envio. Verifique o token.",
    });
    expect(assign).not.toHaveBeenCalled();
  });

  test("a 401 that is not about the session does not loop through the login page", async () => {
    reply(401, { error: "Outra coisa." });
    await expect(callApi("/api/shipments")).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });
});
