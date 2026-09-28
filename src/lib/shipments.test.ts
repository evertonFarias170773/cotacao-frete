import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeMelhorEnvio, fixture, jsonResponse } from "@/test/meFetch";
import { TEST_SENDERS, TEST_SENDERS_JSON } from "@/test/senders";
import type { ContractRequest } from "./recipient";
import { SAME_DOCUMENT_MESSAGE } from "./recipient";
import {
  APP_TAG,
  addToCart,
  createPixForOrders,
  payOrders,
  listAgencies,
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
    const charge = await createPixForOrders([orderA, orderB]);

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
    await createPixForOrders([orderA, orderB]);
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ value: "117.56" });
  });

  test("no PIX is created when the balance already covers the orders", async () => {
    const { calls } = fakeMelhorEnvio(walletRoutes(500));
    expect(await createPixForOrders([orderA])).toEqual({ amount: 0 });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("refuses to charge for orders that are no longer waiting in the cart", async () => {
    const { calls } = fakeMelhorEnvio(walletRoutes(0));
    await expect(createPixForOrders([orderA, "00000000-0000-4000-8000-000000000000"])).rejects.toMatchObject({
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
    await createPixForOrders([orderA, orderB]);
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
    expect(await payOrders([orderA, orderB])).toEqual({ status: "paid", protocol: "PUR-202609144989" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ orders: [orderA, orderB] });
  });

  test("without enough balance, says how much PIX is missing and does not call checkout", async () => {
    const { calls } = fakeMelhorEnvio(routes({ balance: 100 }));
    expect(await payOrders([orderA, orderB])).toEqual({ status: "insufficient", pix: 37.66 });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("a repeated payment the API answers with 204 counts as paid", async () => {
    fakeMelhorEnvio(routes({ balance: 500, checkoutReply: () => jsonResponse(204, null) }));
    expect(await payOrders([orderA, orderB])).toEqual({ status: "paid" });
  });

  test("the documented 'already paid' 422 also counts as paid", async () => {
    fakeMelhorEnvio(
      routes({ balance: 500, checkoutReply: () => jsonResponse(422, { message: "One or more orders have already been paid." }) }),
    );
    expect(await payOrders([orderA, orderB])).toEqual({ status: "paid" });
  });

  test("orders already paid and gone from the cart are not charged again", async () => {
    const { calls } = fakeMelhorEnvio(routes({ balance: 0, inCart: [] }));
    expect(await payOrders([paidOrder.id])).toEqual({ status: "paid" });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("an order that is neither in the cart nor paid cannot be paid", async () => {
    fakeMelhorEnvio([
      { method: "GET", path: /\/balance$/, reply: () => jsonResponse(200, { balance: 500 }) },
      { method: "GET", path: /\/cart\?page=1$/, reply: () => jsonResponse(200, { data: [], last_page: 1 }) },
      { method: "GET", path: /\/orders\/[\w-]+$/, reply: () => jsonResponse(200, { id: orderA, status: "canceled", paid_at: null }) },
    ]);
    await expect(payOrders([orderA])).rejects.toMatchObject({ status: 409 });
  });

  test("other checkout refusals carry the API's reason", async () => {
    fakeMelhorEnvio(routes({ balance: 500, checkoutReply: () => jsonResponse(422, { error: "Serviço indisponível." }) }));
    await expect(payOrders([orderA, orderB])).rejects.toMatchObject({ status: 422, message: "Serviço indisponível." });
  });
});
