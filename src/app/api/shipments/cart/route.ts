import { contractRequestSchema } from "@/lib/recipient";
import { requireSession } from "@/lib/requireSession";
import { errorResponse, orderIdsSchema, parseBody } from "@/lib/routeHelpers";
import { addToCart, removeFromCart } from "@/lib/shipments";

/** Puts an accepted quote in the Melhor Envio cart and returns the confirmed price. */
export async function POST(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const body = await parseBody(request, contractRequestSchema);
  if ("response" in body) return body.response;

  try {
    return Response.json(await addToCart(body.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/shipments/cart");
  }
}

/** Removes cart items the user gave up on before paying. */
export async function DELETE(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const body = await parseBody(request, orderIdsSchema);
  if ("response" in body) return body.response;

  await removeFromCart(body.data.orders);
  return Response.json({ ok: true });
}
