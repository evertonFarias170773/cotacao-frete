/**
 * Session settings read from the environment. No "server-only" here: the proxy imports it too.
 * Returning null makes every caller fail closed.
 */
const MIN_SECRET_LENGTH = 32;

export function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim() ?? "";
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function appPassword(): string {
  return process.env.APP_PASSWORD ?? "";
}

export const UNAUTHENTICATED_MESSAGE = "Entre com a senha para continuar.";
export const NOT_CONFIGURED_MESSAGE = "Acesso não configurado no servidor.";
