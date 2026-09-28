/** Where to go after logging in. Only paths inside this app; anything else falls back to "/". */
export function safeNextPath(value: string | undefined | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === "/entrar" || value.startsWith("/entrar?")) return "/";
  return value;
}
