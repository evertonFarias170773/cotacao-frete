export class QuoteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "QuoteError";
    this.status = status;
  }
}

/**
 * Maps a non-2xx Melhor Envio response into a user-facing error.
 * The API answers in three shapes: { error }, { message, suggestion } and { message, errors }.
 */
export function mapApiError(status: number, body: unknown): QuoteError {
  if (status === 401) {
    return new QuoteError(401, "Não foi possível autenticar no Melhor Envio. Verifique o token.");
  }
  if (status === 403) {
    return new QuoteError(403, "O token do Melhor Envio não tem permissão para esta operação.");
  }
  const readable = readableMessage(body);
  if (status === 422) {
    return new QuoteError(422, readable || "Dados inválidos para cotação.");
  }
  if (status >= 400 && status < 500 && readable) {
    return new QuoteError(422, readable);
  }
  return new QuoteError(502, `Erro ao consultar o Melhor Envio (HTTP ${status}).`);
}

/** Internal codes like "E-CRT-0001: " mean nothing to the user. */
const ERROR_CODE_PREFIX = /^[A-Z]-[A-Z]{3}-\d{4}:\s*/;

function readableMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const { message, errors, error, suggestion } = body as {
    message?: unknown;
    errors?: unknown;
    error?: unknown;
    suggestion?: unknown;
  };

  let text = "";
  if (errors && typeof errors === "object") {
    const messages = Object.values(errors as Record<string, unknown>)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => typeof value === "string");
    text = messages.join(" ");
  }
  if (!text && typeof error === "string") text = error;
  if (!text && typeof message === "string") text = message;
  text = text.replace(ERROR_CODE_PREFIX, "").trim();

  if (text && typeof suggestion === "string" && suggestion.trim()) text = `${text} ${suggestion.trim()}`;
  return text;
}
