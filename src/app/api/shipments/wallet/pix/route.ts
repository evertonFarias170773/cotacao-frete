import { z } from "zod";
import { requireSession } from "@/lib/requireSession";
import { errorResponse, orderIdsSchema, parseBody } from "@/lib/routeHelpers";
import { createPixForOrders, pixStatus } from "@/lib/shipments";

/** Creates a PIX that tops the wallet up with what these orders are missing. */
export async function POST(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const body = await parseBody(request, orderIdsSchema);
  if ("response" in body) return body.response;

  try {
    return Response.json(await createPixForOrders(body.data.orders), { headers: { "Cache-Control": "no-store" } });
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
