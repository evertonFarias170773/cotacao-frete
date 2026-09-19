import { describe, expect, test } from "vitest";
import { QuoteError, mapApiError } from "./errors";

describe("mapApiError", () => {
  test("401 -> authentication message", () => {
    const err = mapApiError(401, { message: "Unauthenticated." });
    expect(err).toBeInstanceOf(QuoteError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("Não foi possível autenticar no Melhor Envio. Verifique o token.");
  });

  test("422 -> joins the validation messages returned by the API", () => {
    const err = mapApiError(422, {
      message: "The given data was invalid.",
      errors: { "to.postal_code": ["O campo to.postal code é obrigatório."], "volumes.0.weight": ["Peso inválido."] },
    });
    expect(err.status).toBe(422);
    expect(err.message).toBe("O campo to.postal code é obrigatório. Peso inválido.");
  });

  test("422 without errors map falls back to message", () => {
    expect(mapApiError(422, { message: "Dados inválidos." }).message).toBe("Dados inválidos.");
  });

  test("other statuses -> generic message with the status code", () => {
    expect(mapApiError(500, null).message).toBe("Erro ao consultar o Melhor Envio (HTTP 500).");
    expect(mapApiError(500, null).status).toBe(502);
  });
});
