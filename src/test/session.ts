import { vi } from "vitest";
import { SESSION_COOKIE, createSession } from "@/lib/session";

export const TEST_SESSION_SECRET = "t".repeat(32);

/** Stubs SESSION_SECRET; call in beforeEach of route tests. */
export function useTestSession() {
  vi.stubEnv("SESSION_SECRET", TEST_SESSION_SECRET);
}

/** A request carrying a valid session cookie. */
export async function authedRequest(url: string, init: RequestInit = {}): Promise<Request> {
  const token = await createSession(TEST_SESSION_SECRET);
  const headers = new Headers(init.headers);
  headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  return new Request(url, { ...init, headers });
}

export function jsonBody(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
