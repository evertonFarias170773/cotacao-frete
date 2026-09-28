import { requireSession } from "@/lib/requireSession";
import { errorResponse, orderIdsSchema, parseBody } from "@/lib/routeHelpers";
import { payOrders } from "@/lib/shipments";

/** Pays the orders with the wallet balance; 409 with the missing PIX amount when the balance is short. */
export async function POST(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const body = await parseBody(request, orderIdsSchema);
  if ("response" in body) return body.response;

  try {
    const result = await payOrders(body.data.orders);
    if (result.status === "insufficient") {
      return Response.json({ error: "Saldo insuficiente.", pix: result.pix }, { status: 409 });
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/shipments/checkout");
  }
}
