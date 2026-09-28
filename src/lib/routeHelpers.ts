import "server-only";
import { z } from "zod";
import { QuoteError } from "./errors";
import { formatCurrency } from "./format";

/** Order ids from Melhor Envio are UUIDs; nothing else may reach a URL path. */
export const orderIdsSchema = z.object({
  orders: z.array(z.uuid({ error: "Identificador de envio inválido." })).min(1).max(50),
});

/** Paying needs the total the user saw, so the server never charges a different amount. */
export const payRequestSchema = orderIdsSchema.extend({
  expectedTotal: z.number({ error: "Informe o valor confirmado." }).nonnegative(),
});

/** Parses a JSON body with a schema; returns the data or a 400 response with the first issue. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.output<T> } | { response: Response }> {
  const json: unknown = await request.json().catch(() => null);
  if (json === null || typeof json !== "object") {
    return { response: Response.json({ error: "Corpo da requisição inválido." }, { status: 400 }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return { response: Response.json({ error: message }, { status: 400 }) };
  }
  return { data: parsed.data };
}

/** 409 carrying the cart's current total, so the screen can show it and ask again. */
export function priceChangedResponse(total: number): Response {
  const price = formatCurrency(total).replace(/\u00a0/g, " ");
  return Response.json({ error: `O preço mudou para ${price}. Confira antes de pagar.`, total }, { status: 409 });
}

/** Turns anything thrown by the shipment operations into a JSON error response. */
export function errorResponse(error: unknown, context: string): Response {
  if (error instanceof QuoteError) return Response.json({ error: error.message }, { status: error.status });
  console.error(`[${context}] unexpected error`, error instanceof Error ? error.message : error);
  return Response.json({ error: "Erro inesperado. Tente novamente." }, { status: 500 });
}
