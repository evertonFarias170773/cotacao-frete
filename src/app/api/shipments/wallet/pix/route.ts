import { z } from "zod";
import { requireSession } from "@/lib/requireSession";
import { errorResponse, parseBody, payRequestSchema, priceChangedResponse } from "@/lib/routeHelpers";
import { createPixForOrders, pixStatus } from "@/lib/shipments";

/** Creates a PIX that tops the wallet up with what these orders are missing, at the confirmed price. */
export async function POST(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const body = await parseBody(request, payRequestSchema);
  if ("response" in body) return body.response;

  try {
    const charge = await createPixForOrders(body.data.orders, body.data.expectedTotal);
    if ("priceChanged" in charge) return priceChangedResponse(charge.priceChanged);
    return Response.json(charge, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/shipments/wallet/pix");
  }
}

/** GET ?id=<payment id> — whether the PIX was paid. */
export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return Response.json({ error: "Pagamento inválido." }, { status: 400 });

  try {
    return Response.json({ status: await pixStatus(id.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/shipments/wallet/pix");
  }
}
