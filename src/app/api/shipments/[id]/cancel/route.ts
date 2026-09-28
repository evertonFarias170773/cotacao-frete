import { z } from "zod";
import { requireSession } from "@/lib/requireSession";
import { errorResponse } from "@/lib/routeHelpers";
import { cancelShipment } from "@/lib/shipments";

/** Requests the cancellation of a paid label; the money returns to the wallet within 12 hours. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const id = z.uuid().safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Envio inválido." }, { status: 400 });

  try {
    await cancelShipment(id.data);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "api/shipments/cancel");
  }
}
