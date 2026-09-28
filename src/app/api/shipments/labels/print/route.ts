import { z } from "zod";
import { QuoteError } from "@/lib/errors";
import { requireSession } from "@/lib/requireSession";
import { labelFile } from "@/lib/shipments";

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

/** This route opens in a new tab, so errors are a small readable page instead of JSON. */
function errorPage(status: number, message: string): Response {
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiqueta</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.25rem">Não foi possível abrir a etiqueta</h1><p>${escapeHtml(message)}</p><p><a href="/envios">Voltar para Envios</a></p></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** GET ?order=<id> — the label PDF, downloaded by the server and served only to logged-in users. */
export async function GET(request: Request) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const order = z.uuid().safeParse(new URL(request.url).searchParams.get("order"));
  if (!order.success) return errorPage(400, "Envio inválido.");

  try {
    const file = await labelFile(order.data);
    return new Response(file.bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="etiqueta-${order.data}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof QuoteError) return errorPage(error.status, error.message);
    console.error("[api/shipments/labels/print] unexpected error", error instanceof Error ? error.message : error);
    return errorPage(500, "Erro inesperado. Tente novamente.");
  }
}
