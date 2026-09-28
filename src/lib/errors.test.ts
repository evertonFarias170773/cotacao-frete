import { describe, expect, test } from "vitest";
import { QuoteError, mapApiError } from "./errors";

describe("mapApiError", () => {
  test("401 -> authentication message", () => {
    const err = mapApiError(401, { message: "Unauthenticated." });
    expect(err).toBeInstanceOf(QuoteError);
    // Upstream auth failure is a server problem (502), never "your session expired" (401).
    expect(err.status).toBe(502);
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

  test("reads the { error } shape the cart uses", () => {
    const err = mapApiError(422, { error: "Não é possível realizar envios com mais de um volume com esta transportadora" });
    expect(err.status).toBe(422);
    expect(err.message).toBe("Não é possível realizar envios com mais de um volume com esta transportadora");
  });

  test("drops the internal error code and appends the API suggestion", () => {
    const err = mapApiError(422, {
      message: "E-CRT-0001: O valor segurado em envios não comerciais não pode ser maior que R$ 1.000,00.",
      suggestion: "Considere alterar o valor do seguro ou o tipo de envio.",
      request_id: "146938010387",
    });
    expect(err.message).toBe(
      "O valor segurado em envios não comerciais não pode ser maior que R$ 1.000,00. Considere alterar o valor do seguro ou o tipo de envio.",
    );
  });

  test("403 means the token lacks permission", () => {
    const err = mapApiError(403, { message: "This action is unauthorized." });
    expect(err.status).toBe(403);
    expect(err.message).toBe("O token do Melhor Envio não tem permissão para esta operação.");
  });

  test("other 4xx with a readable message pass the message on", () => {
    const err = mapApiError(400, { error: "Pedido não encontrado." });
    expect(err.status).toBe(422);
    expect(err.message).toBe("Pedido não encontrado.");
  });
});
