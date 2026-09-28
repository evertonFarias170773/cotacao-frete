import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeMelhorEnvio, fixture, jsonResponse } from "@/test/meFetch";
import { TEST_SENDERS, TEST_SENDERS_JSON } from "@/test/senders";
import type { ContractRequest } from "./recipient";
import { SAME_DOCUMENT_MESSAGE } from "./recipient";
import {
  APP_TAG,
  addToCart,
  cancelShipment,
  createPixForOrders,
  generateLabels,
  labelFile,
  labelsStatus,
  payOrders,
  listAgencies,
  listCart,
  listShipments,
  pixStatus,
  removeFromCart,
  walletBalance,
} from "./shipments";

const cartPac = fixture<{ id: string; price: number }>("cart-pac");

const contract: ContractRequest = {
  quote: {
    originId: "poa",
    destinationCep: "01018020",
    volumes: [{ height: 21.6, width: 22, length: 32, weight: 9.45, insurance: 1215, quantity: 2 }],
    options: { receipt: false, own_hand: false },
  },
  serviceId: 1,
  recipient: {
    name: "Cliente Ficticio",
    document: "529.982.247-25",
    phone: "11912345678",
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
  vi.stubEnv("MELHOR_ENVIO_TOKEN", "token");
  vi.stubEnv("MELHOR_ENVIO_ENV", "production");
  vi.stubEnv("SENDERS_JSON", TEST_SENDERS_JSON);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("addToCart", () => {
  test("Correios with two volumes creates two cart items and sums their prices", async () => {
    const { calls } = fakeMelhorEnvio([
      {
        method: "POST",
        path: /^\/api\/v2\/me\/cart$/,
        reply: (_body, n) => jsonResponse(201, { ...cartPac, id: `order-${n}`, protocol: `ORD-${n}` }),
      },
    ]);

    const result = await addToCart(contract);

    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
    expect(result.orders).toEqual([
      { id: "order-1", protocol: "ORD-1", price: 68.83 },
      { id: "order-2", protocol: "ORD-2", price: 68.83 },
    ]);
    expect(result.total).toBe(137.66);
  });

  test("the sender always comes from the server configuration of the origin", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "POST", path: /\/cart$/, reply: () => jsonResponse(201, cartPac) },
    ]);
    await addToCart({ ...contract, quote: { ...contract.quote, volumes: [{ ...contract.quote.volumes[0], quantity: 1 }] } });
    const sent = calls[0].body as { from: { postal_code: string; company_document: string }; options: { tags: { tag: string }[] } };
    expect(sent.from.postal_code).toBe(TEST_SENDERS.poa.postalCode);
    expect(sent.from.company_document).toBe(TEST_SENDERS.poa.companyDocument);
    expect(sent.options.tags[0].tag).toBe(APP_TAG);
  });

  test("when the second item fails, the first is removed and the API reason is reported", async () => {
    const { calls } = fakeMelhorEnvio([
      {
        method: "POST",
        path: /\/cart$/,
        reply: (_body, n) =>
          n === 1
            ? jsonResponse(201, { ...cartPac, id: "order-1" })
            : jsonResponse(422, { message: "E-CRT-0001: Valor alto.", suggestion: "Troque o tipo de envio." }),
      },
      { method: "DELETE", path: /\/cart\/order-1$/, reply: () => jsonResponse(204, null) },
    ]);

    await expect(addToCart(contract)).rejects.toMatchObject({ status: 422, message: "Valor alto. Troque o tipo de envio." });
    expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/cart/order-1"))).toBe(true);
  });

  test("a network failure midway also removes what was already created", async () => {
    let n = 0;
    const deleted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (init.method === "DELETE") {
          deleted.push(url);
          return jsonResponse(204, null);
        }
        n += 1;
        if (n === 1) return jsonResponse(201, { ...cartPac, id: "order-1" });
        throw new TypeError("fetch failed");
      }),
    );
    await expect(addToCart(contract)).rejects.toMatchObject({ status: 504 });
    expect(deleted.some((url) => url.endsWith("/cart/order-1"))).toBe(true);
  });

  test("warns when the NF-e was issued by another CNPJ than the origin's sender", async () => {
    fakeMelhorEnvio([{ method: "POST", path: /\/cart$/, reply: () => jsonResponse(201, cartPac) }]);
    const single = { ...contract.quote, volumes: [{ ...contract.quote.volumes[0], quantity: 1 }] };
    const other = await addToCart({
      ...contract,
      quote: single,
      content: { kind: "invoice", key: "43260911222333000181550010000543211876543211" },
    });
    expect(other.warnings).toEqual([
      "A NF-e foi emitida pelo CNPJ 11.222.333/0001-81, diferente do CNPJ do remetente desta origem. Confira se é a nota certa.",
    ]);

    const own = await addToCart({
      ...contract,
      quote: single,
      content: { kind: "invoice", key: "43260946867029000176550010000123451123456780" },
    });
    expect(own.warnings).toEqual([]);
  });

  test("Total Express between units with the same CNPJ is refused before calling the API", async () => {
    const { calls } = fakeMelhorEnvio([]);
    const toOwnUnit: ContractRequest = {
      ...contract,
      serviceId: 35,
      recipient: { ...contract.recipient, document: TEST_SENDERS.scs.companyDocument },
    };
    await expect(addToCart(toOwnUnit)).rejects.toMatchObject({ status: 422, message: SAME_DOCUMENT_MESSAGE });
    expect(calls).toHaveLength(0);
  });

  test("missing sender configuration is a server error with a clear message", async () => {
    vi.stubEnv("SENDERS_JSON", "");
    fakeMelhorEnvio([]);
    await expect(addToCart(contract)).rejects.toMatchObject({
      status: 500,
      message: "Dados do remetente não configurados no servidor (SENDERS_JSON).",
    });
  });

  test("an unexpected cart answer is reported, and the item is not left behind", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "POST", path: /\/cart$/, reply: () => jsonResponse(201, { nada: true }) },
    ]);
    await expect(
      addToCart({ ...contract, quote: { ...contract.quote, volumes: [{ ...contract.quote.volumes[0], quantity: 1 }] } }),
    ).rejects.toMatchObject({ status: 502 });
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });
});

describe("removeFromCart", () => {
  test("deletes every id and ignores ones that are already gone", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "DELETE", path: /\/cart\/a$/, reply: () => jsonResponse(204, null) },
      { method: "DELETE", path: /\/cart\/b$/, reply: () => jsonResponse(404, { message: "not found" }) },
    ]);
    await expect(removeFromCart(["a", "b"])).resolves.toBeUndefined();
    expect(calls.map((c) => c.path)).toEqual(["/api/v2/me/cart/a", "/api/v2/me/cart/b"]);
  });
});

describe("listAgencies", () => {
  const agency = (id: number, name: string, city: string) => ({
    id,
    name,
    address: { address: `Rua ${name}`, number: "1", city: { city } },
  });

  test("lists the origin city's agencies with the team's usual one first, even from another city", async () => {
    const { calls } = fakeMelhorEnvio([
      {
        method: "GET",
        path: /\/shipment\/agencies/,
        reply: () =>
          jsonResponse(200, [
            agency(1, "Zeta", "Porto Alegre"),
            agency(5677, "QNS02", "Canoas"),
            agency(2, "Alfa", "Porto Alegre"),
            agency(3, "Longe", "Torres"),
          ]),
      },
    ]);

    const list = await listAgencies(9, "poa");

    expect(calls[0].path).toBe("/api/v2/me/shipment/agencies?company=9&state=RS");
    expect(list.map((a) => a.id)).toEqual([5677, 2, 1]);
    expect(list[0]).toEqual({ id: 5677, name: "QNS02", address: "Rua QNS02, 1 - Canoas", preferred: true });
  });
});

describe("wallet and PIX", () => {
  const cartList = fixture<{ data: { id: string; price: number }[] }>("cart-list");
  const [orderA, orderB] = cartList.data.map((order) => order.id);
  const pixCreated = fixture("pix-create");

  const walletRoutes = (balance: number) => [
    { method: "GET", path: /\/api\/v2\/me\/balance$/, reply: () => jsonResponse(200, { balance, reserved: 0, debts: 0 }) },
    { method: "GET", path: /\/api\/v2\/me\/cart\?page=1$/, reply: () => jsonResponse(200, { ...cartList, last_page: 1 }) },
    { method: "POST", path: /\/api\/v2\/me\/balance$/, reply: () => jsonResponse(200, pixCreated) },
  ];

  test("walletBalance reads the available balance", async () => {
    fakeMelhorEnvio(walletRoutes(42.5));
    expect(await walletBalance()).toBe(42.5);
  });

  test("with an empty wallet, the PIX covers the orders' cart prices", async () => {
    const { calls } = fakeMelhorEnvio(walletRoutes(0));
    const charge = await createPixForOrders([orderA, orderB], 137.66);

    const topUp = calls.find((c) => c.method === "POST");
    expect(topUp?.body).toEqual({ gateway: "yapay-transparente", slug: "pix", value: "137.66" });
    expect(charge).toEqual({
      paymentId: "a2db3a3b-0000-4000-8000-000000000001",
      amount: 137.66,
      qrCodeUrl: "https://example.com/qrcode-ficticio.svg",
      copyPaste: "00020101021226770014BR.GOV.BCB.PIX-FICTICIO6304ABCD",
      expiresAt: "2026-09-29T16:43:06",
    });
  });

  test("the PIX only covers what the balance is missing", async () => {
    const { calls } = fakeMelhorEnvio(walletRoutes(20.1));
    await createPixForOrders([orderA, orderB], 137.66);
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ value: "117.56" });
  });

  test("no PIX is created when the balance already covers the orders", async () => {
    const { calls } = fakeMelhorEnvio(walletRoutes(500));
    expect(await createPixForOrders([orderA], 68.83)).toEqual({ amount: 0 });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("no PIX is created for a price the user did not see", async () => {
    const { calls } = fakeMelhorEnvio(walletRoutes(0));
    expect(await createPixForOrders([orderA, orderB], 100)).toEqual({ priceChanged: 137.66 });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("refuses to charge for orders that are no longer waiting in the cart", async () => {
    const { calls } = fakeMelhorEnvio(walletRoutes(0));
    await expect(createPixForOrders([orderA, "00000000-0000-4000-8000-000000000000"], 68.83)).rejects.toMatchObject({
      status: 409,
      message: "Este envio não está mais aguardando pagamento. Confira na tela Envios.",
    });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("looks through every page of the cart", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "GET", path: /\/balance$/, reply: () => jsonResponse(200, { balance: 0 }) },
      {
        method: "GET",
        path: /\/cart\?page=1$/,
        reply: () => jsonResponse(200, { data: [cartList.data[0]], current_page: 1, last_page: 2 }),
      },
      {
        method: "GET",
        path: /\/cart\?page=2$/,
        reply: () => jsonResponse(200, { data: [cartList.data[1]], current_page: 2, last_page: 2 }),
      },
      { method: "POST", path: /\/balance$/, reply: () => jsonResponse(200, pixCreated) },
    ]);
    await createPixForOrders([orderA, orderB], 137.66);
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ value: "137.66" });
  });

  test("pixStatus tells pending, paid and failed apart", async () => {
    const statuses = ["pending", "authorized", "paid", "canceled", "unauthorized", "something-new"];
    let n = 0;
    fakeMelhorEnvio([
      { method: "GET", path: /\/api\/v2\/me\/payments\//, reply: () => jsonResponse(200, { status: statuses[n++] }) },
    ]);
    const results = [];
    for (let i = 0; i < statuses.length; i++) results.push(await pixStatus("a2db3a3b-0000-4000-8000-000000000001"));
    expect(results).toEqual(["pending", "paid", "paid", "failed", "failed", "pending"]);
  });
});

describe("payOrders", () => {
  const cartList = fixture<{ data: { id: string; price: number }[] }>("cart-list");
  const [orderA, orderB] = cartList.data.map((order) => order.id);
  const paidOrder = fixture<{ id: string }>("order");
  const checkout = fixture("checkout");

  const routes = ({ balance, inCart = cartList.data, checkoutReply = () => jsonResponse(200, checkout) }: {
    balance: number;
    inCart?: typeof cartList.data;
    checkoutReply?: () => Response;
  }) => [
    { method: "GET", path: /\/balance$/, reply: () => jsonResponse(200, { balance }) },
    { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, { data: inCart, last_page: 1 }) },
    { method: "GET", path: /\/orders\/[\w-]+$/, reply: () => jsonResponse(200, paidOrder) },
    { method: "POST", path: /\/shipment\/checkout$/, reply: checkoutReply },
  ];

  test("with enough balance, pays every order in one checkout", async () => {
    const { calls } = fakeMelhorEnvio(routes({ balance: 500 }));
    expect(await payOrders([orderA, orderB], 137.66)).toEqual({ status: "paid", protocol: "PUR-202609144989" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ orders: [orderA, orderB] });
  });

  test("without enough balance, says how much PIX is missing and does not call checkout", async () => {
    const { calls } = fakeMelhorEnvio(routes({ balance: 100 }));
    expect(await payOrders([orderA, orderB], 137.66)).toEqual({ status: "insufficient", pix: 37.66 });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("a repeated payment the API answers with 204 counts as paid", async () => {
    fakeMelhorEnvio(routes({ balance: 500, checkoutReply: () => jsonResponse(204, null) }));
    expect(await payOrders([orderA, orderB], 137.66)).toEqual({ status: "paid" });
  });

  test("the documented 'already paid' 422 also counts as paid", async () => {
    fakeMelhorEnvio(
      routes({ balance: 500, checkoutReply: () => jsonResponse(422, { message: "One or more orders have already been paid." }) }),
    );
    expect(await payOrders([orderA, orderB], 137.66)).toEqual({ status: "paid" });
  });

  test("a cart price different from the one the user saw is not paid", async () => {
    const { calls } = fakeMelhorEnvio(routes({ balance: 500 }));
    expect(await payOrders([orderA, orderB], 120)).toEqual({ status: "price_changed", total: 137.66 });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("orders already paid and gone from the cart are not charged again", async () => {
    const { calls } = fakeMelhorEnvio(routes({ balance: 0, inCart: [] }));
    expect(await payOrders([paidOrder.id], 68.83)).toEqual({ status: "paid" });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("retrying after payment works when the cart is empty (the API answers 204)", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(204, null) },
      { method: "GET", path: /\/orders\/[\w-]+$/, reply: () => jsonResponse(200, paidOrder) },
    ]);
    expect(await payOrders([paidOrder.id], 68.83)).toEqual({ status: "paid" });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("an order that is neither in the cart nor paid cannot be paid", async () => {
    fakeMelhorEnvio([
      { method: "GET", path: /\/balance$/, reply: () => jsonResponse(200, { balance: 500 }) },
      { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, { data: [], last_page: 1 }) },
      { method: "GET", path: /\/orders\/[\w-]+$/, reply: () => jsonResponse(200, { id: orderA, status: "canceled", paid_at: null }) },
    ]);
    await expect(payOrders([orderA], 68.83)).rejects.toMatchObject({ status: 409 });
  });

  test("other checkout refusals carry the API's reason", async () => {
    fakeMelhorEnvio(routes({ balance: 500, checkoutReply: () => jsonResponse(422, { error: "Serviço indisponível." }) }));
    await expect(payOrders([orderA, orderB], 137.66)).rejects.toMatchObject({ status: 422, message: "Serviço indisponível." });
  });
});

describe("labels", () => {
  const A = "a2db3844-f23e-4367-b6cf-02fb76413df5";
  const B = "a2db3845-d38f-4fbd-a233-26d4314c7810";

  test("generation reports each order, including partial failures", async () => {
    const { calls } = fakeMelhorEnvio([
      {
        method: "POST",
        path: /\/shipment\/generate$/,
        reply: () =>
          jsonResponse(200, {
            generate_key: "k",
            [A]: { status: true, message: "Envio encaminhado para geração" },
            [B]: { status: false, message: "Agência inválida para o serviço." },
          }),
      },
    ]);
    expect(await generateLabels([A, B])).toEqual([
      { id: A, ok: true, message: "Envio encaminhado para geração" },
      { id: B, ok: false, message: "Agência inválida para o serviço." },
    ]);
    expect(calls[0].body).toEqual({ orders: [A, B] });
  });

  test("an order missing from the generation answer is reported as failed", async () => {
    fakeMelhorEnvio([
      { method: "POST", path: /\/shipment\/generate$/, reply: () => jsonResponse(200, { [A]: { status: true, message: "ok" } }) },
    ]);
    expect((await generateLabels([A, B]))[1]).toEqual({ id: B, ok: false, message: "A transportadora não respondeu por este envio." });
  });

  test("status tells generated labels apart and exposes the tracking code", async () => {
    fakeMelhorEnvio([
      {
        method: "GET",
        path: /\/orders\/[\w-]+$/,
        reply: (_body, n) =>
          jsonResponse(
            200,
            n === 1
              ? { id: A, status: "generated", generated_at: "2026-09-28 20:00:00", tracking: "ME2600000001BR" }
              : { id: B, status: "released", generated_at: null, tracking: null, self_tracking: null },
          ),
      },
    ]);
    expect(await labelsStatus([A, B])).toEqual([
      { id: A, status: "generated", generated: true, tracking: "ME2600000001BR" },
      { id: B, status: "released", generated: false, tracking: null },
    ]);
  });
});

describe("labelFile", () => {
  const ORDER = "a2db3844-f23e-4367-b6cf-02fb76413df5";
  const FILE_URL = "https://me-0047-prod.s3.amazonaws.com/labels/etiqueta.pdf";
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

  function fakeServers(meReply: () => Response) {
    const seen: { url: string; authorization: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        seen.push({ url, authorization: headers.get("Authorization") });
        if (url.startsWith("https://melhorenvio.com.br")) return meReply();
        return new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf" } });
      }),
    );
    return seen;
  }

  test("asks Melhor Envio for the PDF and downloads it without sending the token to the file host", async () => {
    const seen = fakeServers(() => jsonResponse(200, FILE_URL));
    const file = await labelFile(ORDER);

    expect(new Uint8Array(file.bytes)).toEqual(pdf);
    expect(file.contentType).toBe("application/pdf");
    expect(seen[0]).toEqual({ url: `https://melhorenvio.com.br/api/v2/me/imprimir/pdf/${ORDER}`, authorization: "Bearer token" });
    expect(seen[1]).toEqual({ url: FILE_URL, authorization: null });
  });

  test("also reads the URL when it comes wrapped in an object", async () => {
    fakeServers(() => jsonResponse(200, { url: FILE_URL }));
    expect((await labelFile(ORDER)).contentType).toBe("application/pdf");
  });

  test("a label not generated yet gives the API's reason", async () => {
    fakeServers(() =>
      jsonResponse(422, {
        message: "E-PRT-0011: O envio precisa estar gerado para que a impressão seja processada.",
        suggestion: "Gere o envio e aguarde a geração ser concluida para a impressão.",
      }),
    );
    await expect(labelFile(ORDER)).rejects.toMatchObject({
      status: 422,
      message: "O envio precisa estar gerado para que a impressão seja processada. Gere o envio e aguarde a geração ser concluida para a impressão.",
    });
  });

  test("refuses anything that is not a PDF, so nothing else is served from the app's origin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("https://melhorenvio.com.br")
          ? jsonResponse(200, FILE_URL)
          : new Response("<html><script>alert(1)</script></html>", { headers: { "Content-Type": "text/html" } }),
      ),
    );
    await expect(labelFile(ORDER)).rejects.toMatchObject({
      status: 502,
      message: "O arquivo recebido não é uma etiqueta em PDF. Tente de novo em instantes.",
    });
  });

  test("refuses a file address that is not https", async () => {
    fakeServers(() => jsonResponse(200, "http://inseguro.example/etiqueta.pdf"));
    await expect(labelFile(ORDER)).rejects.toMatchObject({ status: 502 });
  });
});

describe("shipment listings", () => {
  const list = fixture<{ data: Record<string, unknown>[] }>("orders-list");

  test("lists orders with what the screen needs, forwarding page and status", async () => {
    const { calls } = fakeMelhorEnvio([
      {
        method: "GET",
        path: /\/api\/v2\/me\/orders\?/,
        reply: () =>
          jsonResponse(200, {
            ...list,
            current_page: 2,
            last_page: 3,
            total: 25,
            data: [{ ...list.data[0], tags: [{ tag: APP_TAG, url: null }] }],
          }),
      },
    ]);
    const result = await listShipments({ page: 2, status: "released" });

    expect(calls[0].path).toBe("/api/v2/me/orders?page=2&status=released");
    expect(result).toMatchObject({ page: 2, lastPage: 3, total: 25 });
    expect(result.items[0]).toEqual({
      id: list.data[0].id,
      protocol: list.data[0].protocol,
      status: "released",
      service: "Correios · PAC",
      price: 68.83,
      recipient: "Cliente Ficticio",
      destination: "Sao Paulo/SP",
      tracking: null,
      createdAt: "2026-09-28 19:37:36",
      paid: true,
      generated: false,
      fromApp: true,
    });
  });

  test("without a status, lists everything", async () => {
    const { calls } = fakeMelhorEnvio([
      { method: "GET", path: /\/orders\?/, reply: () => jsonResponse(200, { ...list, current_page: 1, last_page: 1, total: 3 }) },
    ]);
    await listShipments({ page: 1 });
    expect(calls[0].path).toBe("/api/v2/me/orders?page=1");
  });

  test("a filter with no results (the API answers 204 with no body) is an empty page", async () => {
    fakeMelhorEnvio([{ method: "GET", path: /\/orders\?/, reply: () => jsonResponse(204, null) }]);
    expect(await listShipments({ page: 1, status: "generated" })).toEqual({ items: [], page: 1, lastPage: 1, total: 0 });
  });

  test("an empty cart (204) lists nothing", async () => {
    fakeMelhorEnvio([{ method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(204, null) }]);
    expect(await listCart()).toEqual([]);
  });

  test("the cart lists what is waiting for payment", async () => {
    const cart = fixture<{ data: Record<string, unknown>[] }>("cart-list");
    fakeMelhorEnvio([{ method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, cart) }]);
    const items = await listCart();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ status: "pending", paid: false, price: 68.83, service: "Correios · PAC" });
  });
});

describe("cancelShipment", () => {
  const cancel = fixture<Record<string, unknown>>("cancel");
  const ORDER = Object.keys(cancel).find((key) => key !== "key") ?? "";

  test("asks for cancellation with the integration reason and reports it as requested", async () => {
    const { calls } = fakeMelhorEnvio([{ method: "POST", path: /\/shipment\/cancel$/, reply: () => jsonResponse(200, cancel) }]);
    await expect(cancelShipment(ORDER)).resolves.toBeUndefined();
    expect(calls[0].body).toEqual({
      order: { id: ORDER, reason_id: "2", description: "Cancelado pela equipe no Cotador de Fretes." },
    });
  });

  test("a refused cancellation explains why", async () => {
    fakeMelhorEnvio([
      { method: "POST", path: /\/shipment\/cancel$/, reply: () => jsonResponse(200, { [ORDER]: { canceled: false } }) },
    ]);
    await expect(cancelShipment(ORDER)).rejects.toMatchObject({
      status: 422,
      message: "O cancelamento não foi aceito. Se a transportadora já recebeu o pacote, não é mais possível cancelar.",
    });
  });

  test("an API refusal carries its own reason", async () => {
    fakeMelhorEnvio([
      { method: "POST", path: /\/shipment\/cancel$/, reply: () => jsonResponse(422, { error: "Envio já postado." }) },
    ]);
    await expect(cancelShipment(ORDER)).rejects.toMatchObject({ status: 422, message: "Envio já postado." });
  });
});
