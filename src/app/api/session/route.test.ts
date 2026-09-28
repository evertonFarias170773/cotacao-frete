import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { DELETE, POST } from "./route";

const SECRET = "s".repeat(32);
const login = (body: unknown) =>
  POST(new Request("http://localhost/api/session", { method: "POST", body: JSON.stringify(body) }));

describe("/api/session", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("APP_PASSWORD", "senha-da-equipe");
  });
  afterEach(() => vi.unstubAllEnvs());

  test("the right password sets a valid, protected session cookie", async () => {
    const response = await login({ password: "senha-da-equipe" });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=43200/);
    const token = cookie.split(";")[0].slice(SESSION_COOKIE.length + 1);
    expect(await verifySession(token, SECRET)).toBe(true);
  });

  test("a wrong password is refused without a cookie", async () => {
    const response = await login({ password: "chute" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Senha incorreta." });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("a malformed body is treated as a wrong password", async () => {
    expect((await login("texto")).status).toBe(401);
  });

  test("refuses to log anyone in when the server has no password configured", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    const response = await login({ password: "" });
    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("logout expires the cookie", async () => {
    const cookie = (await DELETE()).headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(cookie).toMatch(/Max-Age=0/);
  });
});
