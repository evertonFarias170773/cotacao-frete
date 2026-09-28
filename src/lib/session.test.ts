import { describe, expect, test } from "vitest";
import { createSession, passwordMatches, verifySession } from "./session";

const SECRET = "s".repeat(32);

describe("session", () => {
  test("accepts a fresh session signed with the same secret", async () => {
    const token = await createSession(SECRET, 1_000, 60_000);
    expect(await verifySession(token, SECRET, 2_000)).toBe(true);
  });

  test("rejects an expired session", async () => {
    const token = await createSession(SECRET, 1_000, 60_000);
    expect(await verifySession(token, SECRET, 61_001)).toBe(false);
  });

  test("rejects a session whose expiry was tampered with", async () => {
    const token = await createSession(SECRET, 1_000, 60_000);
    const [, signature] = token.split(".");
    expect(await verifySession(`99999999999999.${signature}`, SECRET, 2_000)).toBe(false);
  });

  test("rejects a session signed with another secret", async () => {
    const token = await createSession("x".repeat(32), 1_000, 60_000);
    expect(await verifySession(token, SECRET, 2_000)).toBe(false);
  });

  test("rejects missing and malformed cookies", async () => {
    expect(await verifySession(undefined, SECRET)).toBe(false);
    expect(await verifySession("", SECRET)).toBe(false);
    expect(await verifySession("abc", SECRET)).toBe(false);
    expect(await verifySession("abc.def", SECRET)).toBe(false);
  });
});

describe("passwordMatches", () => {
  test("compares the whole password", () => {
    expect(passwordMatches("segredo-longo", "segredo-longo")).toBe(true);
    expect(passwordMatches("segredo-long", "segredo-longo")).toBe(false);
    expect(passwordMatches("", "segredo-longo")).toBe(false);
  });

  test("never matches when no password is configured", () => {
    expect(passwordMatches("", "")).toBe(false);
  });
});
