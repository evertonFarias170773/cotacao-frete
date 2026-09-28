import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeMelhorEnvio, fixture, jsonResponse } from "@/test/meFetch";
import { TEST_SENDERS, TEST_SENDERS_JSON } from "@/test/senders";
import { authedRequest, jsonBody, useTestSession } from "@/test/session";
import { DELETE, POST } from "./route";

const URL = "http://localhost/api/shipments/cart";

const contract = {
  quote: {
    originId: "scs",
    destinationCep: "01018-020",
    volumes: [{ height: 22, width: 22, length: 32, weight: 9.45, insurance: 500, quantity: 1 }],
    options: { receipt: false, own_hand: false },
  },
  serviceId: 1,
  recipient: {
    name: "Cliente Ficticio",
    document: "529.982.247-25",
    phone: "(11) 91234-5678",
    email: "",
    address: "Rua Anita Garibaldi",
    number: "25",
    complement: "",
    district: "Sé",
    city: "São Paulo",
    stateAbbr: "SP",
  },
  content: { kind: "declaration", description: "Pulseira Tri Band" },
};

beforeEach(() => {
  useTestSession();
  vi.stubEnv("MELHOR_ENVIO_TOKEN", "token");
  vi.stubEnv("SENDERS_JSON", TEST_SENDERS_JSON);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/shipments/cart", () => {
  test("refuses requests without a session and never calls the API", async () => {
    const { calls } = fakeMelhorEnvio([]);
    const response = await POST(new Request(URL, jsonBody(contract)));
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  test("reports the first validation problem of the body", async () => {
    const { calls } = fakeMelhorEnvio([]);
    const response = await POST(
      await authedRequest(URL, jsonBody({ ...contract, recipient: { ...contract.recipient, document: "123" } })),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "CPF ou CNPJ inválido." });
    expect(calls).toHaveLength(0);
  });

  test("puts the shipment in the cart with the configured sender, ignoring any sender in the body", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "POST", path: /\/cart$/, reply: () => jsonResponse(201, fixture("cart-pac")) },
    ]);
    const forged = { ...contract, sender: { postalCode: "01001000", companyDocument: "11222333000181" } };
    const response = await POST(await authedRequest(URL, jsonBody(forged)));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { orders: { price: number }[]; total: number };
    expect(body.total).toBe(68.83);
    const sent = calls[0].body as { from: { postal_code: string; company_document: string } };
    expect(sent.from.postal_code).toBe(TEST_SENDERS.scs.postalCode);
    expect(sent.from.company_document).toBe(TEST_SENDERS.scs.companyDocument);
  });

  test("passes the API's reason on when the cart refuses the shipment", async () => {
    fakeMelhorEnvio([
      {
        method: "POST",
        path: /\/cart$/,
        reply: () => jsonResponse(422, { error: "Não é possível realizar envios com mais de um volume com esta transportadora" }),
      },
    ]);
    const response = await POST(await authedRequest(URL, jsonBody(contract)));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Não é possível realizar envios com mais de um volume com esta transportadora",
    });
  });
});

describe("DELETE /api/shipments/cart", () => {
  test("removes the given orders from the cart", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "DELETE", path: /\/cart\/[\w-]+$/, reply: () => jsonResponse(204, null) },
    ]);
    const response = await DELETE(
      await authedRequest(URL, { ...jsonBody({ orders: ["a2db3844-f23e-4367-b6cf-02fb76413df5"] }), method: "DELETE" }),
    );
    expect(response.status).toBe(200);
    expect(calls).toEqual([
      { method: "DELETE", path: "/api/v2/me/cart/a2db3844-f23e-4367-b6cf-02fb76413df5", body: undefined },
    ]);
  });

  test("refuses anything that is not a list of order ids", async () => {
    const { calls } = fakeMelhorEnvio([]);
    const response = await DELETE(await authedRequest(URL, { ...jsonBody({ orders: ["../balance"] }), method: "DELETE" }));
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("requires a session", async () => {
    const response = await DELETE(new Request(URL, { ...jsonBody({ orders: [] }), method: "DELETE" }));
    expect(response.status).toBe(401);
  });
});
