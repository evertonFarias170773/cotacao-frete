import { z } from "zod";
import { requireSession } from "@/lib/requireSession";
import { errorResponse } from "@/lib/routeHelpers";
import { SHIPMENT_STATUSES, listCart, listShipments } from "@/lib/shipments";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  status: z.enum(SHIPMENT_STATUSES).optional(),
});

/** GET ?page=&status= — the account's shipments; GET ?view=cart — what waits for payment. */
export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  try {
    if (params.get("view") === "cart") return Response.json({ items: await listCart() }, { headers: { "Cache-Control": "no-store" } });

    const query = querySchema.safeParse({ page: params.get("page") ?? undefined, status: params.get("status") || undefined });
    if (!query.success) return Response.json({ error: "Filtro inválido." }, { status: 400 });
    return Response.json(await listShipments(query.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/shipments");
  }
}
