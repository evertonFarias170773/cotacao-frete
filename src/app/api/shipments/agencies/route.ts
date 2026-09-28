import { ORIGIN_IDS, type OriginId } from "@/config/origins";
import { requireSession } from "@/lib/requireSession";
import { errorResponse } from "@/lib/routeHelpers";
import { listAgencies } from "@/lib/shipments";

/** GET /api/shipments/agencies?company=9&origin=scs — drop-off agencies for the contract screen. */
export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const company = Number(params.get("company"));
  const origin = params.get("origin") ?? "";
  if (!Number.isInteger(company) || company <= 0 || !(ORIGIN_IDS as readonly string[]).includes(origin)) {
    return Response.json({ error: "Informe a transportadora e a origem." }, { status: 400 });
  }

  try {
    return Response.json({ agencies: await listAgencies(company, origin as OriginId) });
  } catch (error) {
    return errorResponse(error, "api/shipments/agencies");
  }
}
