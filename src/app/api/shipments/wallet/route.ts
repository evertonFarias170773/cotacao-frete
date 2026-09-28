import { requireSession } from "@/lib/requireSession";
import { errorResponse } from "@/lib/routeHelpers";
import { walletBalance } from "@/lib/shipments";

/** GET — the Melhor Envio wallet balance, shown on the payment step. */
export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  try {
    return Response.json({ balance: await walletBalance() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/shipments/wallet");
  }
}
