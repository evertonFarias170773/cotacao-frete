import { SESSION_COOKIE, SESSION_TTL_MS, createSession, passwordMatches } from "@/lib/session";
import { NOT_CONFIGURED_MESSAGE, appPassword, sessionSecret } from "@/lib/sessionConfig";

const WRONG_PASSWORD_DELAY_MS = 500;
const COOKIE_FLAGS = "HttpOnly; Secure; SameSite=Lax; Path=/";

export async function POST(request: Request) {
  const secret = sessionSecret();
  const expected = appPassword();
  if (!secret || !expected) return Response.json({ error: NOT_CONFIGURED_MESSAGE }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = body && typeof body === "object" && typeof body.password === "string" ? body.password : "";
  if (!passwordMatches(password, expected)) {
    // Slows down guessing without needing any storage.
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return Response.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const token = await createSession(secret);
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${SESSION_COOKIE}=${token}; ${COOKIE_FLAGS}; Max-Age=${SESSION_TTL_MS / 1000}` } },
  );
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `${SESSION_COOKIE}=; ${COOKIE_FLAGS}; Max-Age=0` } });
}
