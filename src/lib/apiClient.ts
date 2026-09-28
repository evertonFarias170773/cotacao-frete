/** Error from one of the app's API routes; carries the HTTP status and the JSON body. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown> | null;

  constructor(message: string, status: number, body: Record<string, unknown> | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Browser-side call to the app's own API routes. Throws an Error whose message can be shown
 * as is (an ApiError for HTTP errors). An expired session sends the user to the login page.
 */
export async function callApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Verifique a internet e tente novamente.");
  }

  if (response.status === 401) {
    // Plain module, no router here; a full navigation also lets the proxy re-check the cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/entrar?para=${encodeURIComponent(window.location.pathname)}`);
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : "Não foi possível concluir. Tente novamente.";
    throw new ApiError(message, response.status, body);
  }
  return body as T;
}
