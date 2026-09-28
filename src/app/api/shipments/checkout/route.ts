import { requireSession } from "@/lib/requireSession";
import { errorResponse, parseBody, payRequestSchema, priceChangedResponse } from "@/lib/routeHelpers";
import { payOrders } from "@/lib/shipments";

/**
 * Pays the orders with the wallet balance. 409 with the missing PIX amount when the balance is short,
 * or with the new total when the cart no longer matches the price the user confirmed.
 */
export async function POST(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const body = await parseBody(request, payRequestSchema);
  if ("response" in body) return body.response;

  try {
    const result = await payOrders(body.data.orders, body.data.expectedTotal);
    if (result.status === "insufficient") {
      return Response.json({ error: "Saldo insuficiente.", pix: result.pix }, { status: 409 });
    }
    if (result.status === "price_changed") return priceChangedResponse(result.total);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/shipments/checkout");
  }
}
