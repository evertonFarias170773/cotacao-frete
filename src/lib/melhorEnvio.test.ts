import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { quoteShipment } from "./melhorEnvio";
import { QuoteError } from "./errors";
import type { QuoteRequest } from "./schemas";

const request: QuoteRequest = {
  originId: "scs",
  destinationCep: "01018020",
  volumes: [{ height: 17, width: 11, length: 11, weight: 0.3, insurance: 10.1, quantity: 1 }],
  options: { receipt: false, own_hand: false },
};

const okService = {
  id: 1,
  name: "PAC",
  price: "25.50",
  custom_price: "25.50",
  custom_delivery_range: { min: 4, max: 5 },
  company: { id: 1, name: "Correios", picture: "" },
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("quoteShipment", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MELHOR_ENVIO_TOKEN", "secret-token");
    vi.stubEnv("MELHOR_ENVIO_ENV", "sandbox");
    vi.stubEnv("MELHOR_ENVIO_USER_AGENT", "Cotador Teste (dev@example.com)");
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("posts the volumes payload with the required headers and returns the normalized result", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [okService]));

    const result = await quoteShipment(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
    expect(headers["User-Agent"]).toBe("Cotador Teste (dev@example.com)");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      from: { postal_code: "96810400" },
      to: { postal_code: "01018020" },
      volumes: [{ width: 11, height: 17, length: 11, weight: 0.3, insurance: 10.1 }],
      options: { receipt: false, own_hand: false },
    });
    expect(result.available[0]).toMatchObject({ id: 1, service: "PAC", price: 25.5 });
  });

  test("uses the production base URL by default", async () => {
    vi.stubEnv("MELHOR_ENVIO_ENV", "");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [okService]));
    await quoteShipment(request);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("https://melhorenvio.com.br/api/v2/me/shipment/calculate");
  });

  test("retries once with the products payload when the API asks for products", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(422, { message: "The given data was invalid.", errors: { products: ["required"] } }))
      .mockResolvedValueOnce(jsonResponse(200, [okService]));

    const result = await quoteShipment(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second.products).toHaveLength(1);
    expect(second.products[0]).toMatchObject({ insurance_value: 10.1, quantity: 1 });
    expect(second.volumes).toBeUndefined();
    expect(result.available).toHaveLength(1);
  });

  test("maps 401 to the authentication message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: "Unauthenticated." }));
    await expect(quoteShipment(request)).rejects.toMatchObject({
      status: 401,
      message: "Não foi possível autenticar no Melhor Envio. Verifique o token.",
    });
  });

  test("maps a plain 422 to its validation message without retrying", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { message: "The given data was invalid.", errors: { "to.postal_code": ["CEP inválido."] } }),
    );
    await expect(quoteShipment(request)).rejects.toMatchObject({ status: 422, message: "CEP inválido." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("maps a timeout/abort to the friendly timeout message", async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const promise = quoteShipment(request, { timeoutMs: 10 });
    await expect(promise).rejects.toMatchObject({ status: 504, message: "A cotação demorou demais. Tente novamente." });
  });

  test("maps a network failure to the friendly timeout message", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(quoteShipment(request)).rejects.toMatchObject({ status: 504, message: "A cotação demorou demais. Tente novamente." });
  });

  test("fails clearly when the token is not configured", async () => {
    vi.stubEnv("MELHOR_ENVIO_TOKEN", "");
    await expect(quoteShipment(request)).rejects.toBeInstanceOf(QuoteError);
    await expect(quoteShipment(request)).rejects.toMatchObject({ status: 500, message: "Token do Melhor Envio não configurado no servidor." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("User-Agent normalization", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MELHOR_ENVIO_TOKEN", "secret-token");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(200, [okService]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const sentUserAgent = () => ((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>)["User-Agent"];

  test("wraps a bare e-mail with the application name", async () => {
    vi.stubEnv("MELHOR_ENVIO_USER_AGENT", "dev@example.com");
    await quoteShipment(request);
    expect(sentUserAgent()).toBe("Cotador de Fretes (dev@example.com)");
  });

  test("keeps a full 'App (e-mail)' value untouched", async () => {
    vi.stubEnv("MELHOR_ENVIO_USER_AGENT", "Minha Loja (ti@loja.com.br)");
    await quoteShipment(request);
    expect(sentUserAgent()).toBe("Minha Loja (ti@loja.com.br)");
  });
});
