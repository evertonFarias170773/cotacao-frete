export class QuoteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "QuoteError";
    this.status = status;
  }
}

/** Maps a non-2xx Melhor Envio response into a user-facing error. */
export function mapApiError(status: number, body: unknown): QuoteError {
  if (status === 401) {
    return new QuoteError(401, "Não foi possível autenticar no Melhor Envio. Verifique o token.");
  }
  if (status === 422) {
    return new QuoteError(422, validationMessages(body) || "Dados inválidos para cotação.");
  }
  return new QuoteError(502, `Erro ao consultar o Melhor Envio (HTTP ${status}).`);
}

function validationMessages(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const { message, errors } = body as { message?: unknown; errors?: unknown };
  if (errors && typeof errors === "object") {
    const messages = Object.values(errors as Record<string, unknown>)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((v): v is string => typeof v === "string");
    if (messages.length > 0) return messages.join(" ");
  }
  return typeof message === "string" ? message : "";
}
