/** Signed session cookie: "<expiresAtMs>.<base64url HMAC-SHA256>". Web Crypto only, so it runs in the proxy too. */
export const SESSION_COOKIE = "cotador_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(secret: string, now = Date.now(), ttlMs = SESSION_TTL_MS): Promise<string> {
  const expiresAt = String(now + ttlMs);
  return `${expiresAt}.${await sign(secret, expiresAt)}`;
}

export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (!constantTimeEqual(await sign(secret, expiresAt), signature)) return false;
  return Number(expiresAt) > now;
}

export function passwordMatches(input: string, expected: string): boolean {
  if (!expected) return false;
  return constantTimeEqual(input, expected);
}
