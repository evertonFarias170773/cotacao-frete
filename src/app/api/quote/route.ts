import { QuoteError } from "@/lib/errors";
import { quoteShipment } from "@/lib/melhorEnvio";
import { quoteRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  if (json === null || typeof json !== "object") {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = quoteRequestSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { error: first ? first.message : "Dados inválidos.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await quoteShipment(parsed.data);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof QuoteError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/quote] unexpected error", error instanceof Error ? error.message : error);
    return Response.json({ error: "Erro inesperado ao cotar. Tente novamente." }, { status: 500 });
  }
}
