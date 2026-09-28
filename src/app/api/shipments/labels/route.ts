import { requireSession } from "@/lib/requireSession";
import { errorResponse, orderIdsSchema, parseBody } from "@/lib/routeHelpers";
import { generateLabels, labelsStatus } from "@/lib/shipments";

/** Sends paid orders for label generation. */
export async function POST(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const body = await parseBody(request, orderIdsSchema);
  if ("response" in body) return body.response;

  try {
    return Response.json({ results: await generateLabels(body.data.orders) });
  } catch (error) {
    return errorResponse(error, "api/shipments/labels");
  }
}

/** GET ?orders=<id>,<id> — whether each label is ready, with its tracking code. */
export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const orders = (new URL(request.url).searchParams.get("orders") ?? "").split(",").filter(Boolean);
  const parsed = orderIdsSchema.safeParse({ orders });
  if (!parsed.success) return Response.json({ error: "Envios inválidos." }, { status: 400 });

  try {
    return Response.json({ labels: await labelsStatus(parsed.data.orders) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/shipments/labels");
  }
}
