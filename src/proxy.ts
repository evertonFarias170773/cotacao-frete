import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { UNAUTHENTICATED_MESSAGE, sessionSecret } from "@/lib/sessionConfig";

/**
 * Optimistic gate: sends visitors without a valid session to /entrar.
 * Route handlers still call requireSession themselves (Next 16 guidance).
 */
export async function proxy(request: NextRequest) {
  const secret = sessionSecret();
  const valid = secret ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret) : false;
  if (valid) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: UNAUTHENTICATED_MESSAGE }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/entrar";
  login.search = "";
  if (pathname !== "/") login.searchParams.set("para", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, the login API and the files the PWA needs before logging in.
  matcher: [
    "/((?!entrar|api/session|_next/static|_next/image|icons/|manifest.webmanifest|sw.js|favicon.ico|icon.png|apple-icon.png).*)",
  ],
};
