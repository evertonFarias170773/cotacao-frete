/**
 * Browser-side call to the app's own API routes. Throws an Error whose message can be shown
 * as is. An expired session sends the user to the login page.
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

  const body = (await response.json().catch(() => null)) as ({ error?: unknown } & Record<string, unknown>) | null;
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "Não foi possível concluir. Tente novamente.");
  }
  return body as T;
}
