import "server-only";
import { SESSION_COOKIE, verifySession } from "./session";
import { NOT_CONFIGURED_MESSAGE, UNAUTHENTICATED_MESSAGE, sessionSecret } from "./sessionConfig";

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/**
 * Every sensitive route starts with this. The proxy only does an optimistic check,
 * so the handler must verify the session itself.
 * Returns the response to send when access is denied, or null when the session is valid.
 */
export async function requireSession(request: Request): Promise<Response | null> {
  const secret = sessionSecret();
  if (!secret) return Response.json({ error: NOT_CONFIGURED_MESSAGE }, { status: 500 });
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (await verifySession(token, secret)) return null;
  return Response.json({ error: UNAUTHENTICATED_MESSAGE }, { status: 401 });
}
