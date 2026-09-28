import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { requireSession } from "./requireSession";
import { SESSION_COOKIE, createSession } from "./session";

const SECRET = "s".repeat(32);
const withCookie = (cookie?: string) =>
  new Request("http://localhost/api/quote", { headers: cookie ? { cookie } : {} });

describe("requireSession", () => {
  beforeEach(() => vi.stubEnv("SESSION_SECRET", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  test("refuses a request without the session cookie", async () => {
    const denied = await requireSession(withCookie());
    expect(denied?.status).toBe(401);
    expect(await denied?.json()).toEqual({ error: "Entre com a senha para continuar." });
  });

  test("refuses a forged cookie", async () => {
    const denied = await requireSession(withCookie(`${SESSION_COOKIE}=99999999999999.forged`));
    expect(denied?.status).toBe(401);
  });

  test("lets a valid session through, among other cookies", async () => {
    const token = await createSession(SECRET);
    expect(await requireSession(withCookie(`theme=dark; ${SESSION_COOKIE}=${token}; x=1`))).toBeNull();
  });

  test("fails closed when SESSION_SECRET is missing or too short", async () => {
    const token = await createSession(SECRET);
    vi.stubEnv("SESSION_SECRET", "");
    expect((await requireSession(withCookie(`${SESSION_COOKIE}=${token}`)))?.status).toBe(500);
    vi.stubEnv("SESSION_SECRET", "curto");
    expect((await requireSession(withCookie(`${SESSION_COOKIE}=${token}`)))?.status).toBe(500);
  });
});
