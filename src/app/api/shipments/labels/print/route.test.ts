import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { jsonResponse } from "@/test/meFetch";
import { authedRequest, useTestSession } from "@/test/session";
import { GET } from "./route";

const URL = "http://localhost/api/shipments/labels/print";
const ORDER = "a2db3844-f23e-4367-b6cf-02fb76413df5";

function fakeServers(meReply: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("https://melhorenvio.com.br")
        ? meReply()
        : new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { headers: { "Content-Type": "application/pdf" } }),
    ),
  );
}

beforeEach(() => {
  useTestSession();
  vi.stubEnv("MELHOR_ENVIO_TOKEN", "token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/shipments/labels/print", () => {
  test("serves the PDF inline, never cached", async () => {
    fakeServers(() => jsonResponse(200, "https://s3.example.com/etiqueta.pdf"));
    const response = await GET(await authedRequest(`${URL}?order=${ORDER}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(`inline; filename="etiqueta-${ORDER}.pdf"`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });

  test("shows a readable page, with the API's text escaped, when the label is not ready", async () => {
    fakeServers(() => jsonResponse(422, { message: "O envio precisa estar gerado <script>x</script>" }));
    const response = await GET(await authedRequest(`${URL}?order=${ORDER}`));
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await response.text();
    expect(html).toContain("O envio precisa estar gerado &lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("refuses an order id that is not a UUID", async () => {
    fakeServers(() => jsonResponse(200, "https://s3.example.com/x.pdf"));
    expect((await GET(await authedRequest(`${URL}?order=../balance`))).status).toBe(400);
  });

  test("requires a session", async () => {
    expect((await GET(new Request(`${URL}?order=${ORDER}`))).status).toBe(401);
  });
});
