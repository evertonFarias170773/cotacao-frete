import { readFileSync } from "node:fs";
import { vi } from "vitest";

/** Body of a real API response captured in src/lib/__fixtures__ (Fase 0). */
export function fixture<T = unknown>(name: string): T {
  const url = new URL(`../lib/__fixtures__/me-${name}.json`, import.meta.url);
  return (JSON.parse(readFileSync(url, "utf8")) as { body: T }).body;
}

export function jsonResponse(status: number, body: unknown): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Route = { method: string; path: RegExp; reply: (body: unknown, call: number) => Response };

/**
 * A fake Melhor Envio: each route answers by method and path, and every call is recorded
 * as { method, path, body } so tests can assert on what the server sent.
 */
export function fakeMelhorEnvio(routes: Route[]) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const counts = new Map<Route, number>();
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = new URL(url).pathname + new URL(url).search;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const route = routes.find((candidate) => candidate.method === method && candidate.path.test(path));
    if (!route) return jsonResponse(404, { message: `rota não simulada: ${method} ${path}` });
    const count = (counts.get(route) ?? 0) + 1;
    counts.set(route, count);
    return route.reply(body, count);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}
