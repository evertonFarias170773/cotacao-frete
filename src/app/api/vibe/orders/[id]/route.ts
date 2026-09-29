import { requireSession } from "@/lib/requireSession";
import { errorResponse } from "@/lib/routeHelpers";
import { fetchVibeOrder } from "@/lib/vibeClient";

const ORDER_NUMBER = /^\d{1,9}$/;

/** GET /api/vibe/orders/22773 — the Vibe order reduced to what the quote and the label need. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const raw = (await context.params).id;
  const id = ORDER_NUMBER.test(raw) ? Number(raw) : 0;
  if (id <= 0) return Response.json({ error: "Informe o número do pedido." }, { status: 400 });

  try {
    return Response.json({ order: await fetchVibeOrder(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/vibe/orders");
  }
}
