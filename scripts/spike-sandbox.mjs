// End-to-end exploration of the Melhor Envio purchase flow against the SANDBOX.
// Run: node scripts/spike-sandbox.mjs
// Uses MELHOR_ENVIO_SANDBOX_TOKEN from .env.local. Never touches production.
// Every request uses fictitious sender/recipient data, and every response is
// sanitized before being saved as a test fixture (the repository is public).
import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE = "https://sandbox.melhorenvio.com.br";
const FIXTURES = "src/lib/__fixtures__";

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "").trim()];
    }),
);
const TOKEN = env.MELHOR_ENVIO_SANDBOX_TOKEN;
if (!TOKEN) throw new Error("MELHOR_ENVIO_SANDBOX_TOKEN ausente no .env.local");
const USER_AGENT = "Cotador de Fretes (sandbox-spike@example.com)";

const PRIVATE_KEYS = new Set(["email", "firstname", "lastname", "birthdate", "picture", "thumbnail", "phone", "email_alternative"]);

/** Removes anything that could identify the sandbox account holder. */
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (key === "user") out[key] = inner && typeof inner === "object" ? { id: "user-sandbox" } : inner;
    else if (PRIVATE_KEYS.has(key) && typeof inner === "string" && inner) out[key] = `${key}-ficticio`;
    else out[key] = sanitize(inner);
  }
  return out;
}

async function call(method, path, body) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "User-Agent": USER_AGENT,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: response.status, json, contentType: response.headers.get("content-type") };
}

const report = [];
async function step(name, fixture, method, path, body, summarize = (j) => JSON.stringify(j).slice(0, 160)) {
  const result = await call(method, path, body);
  report.push(`${String(result.status).padEnd(4)} ${name.padEnd(42)} ${summarize(result.json ?? {})}`);
  if (fixture) {
    await writeFile(
      `${FIXTURES}/me-${fixture}.json`,
      JSON.stringify({ request: body === undefined ? null : sanitize(body), status: result.status, body: sanitize(result.json) }, null, 2) + "\n",
    );
  }
  return result;
}

const sender = {
  name: "Remetente Ficticio LTDA",
  phone: "5133334444",
  email: "remetente@example.com",
  company_document: "46867029000176",
  state_register: "",
  address: "Rua do Remetente Teste",
  number: "100",
  district: "Medianeira",
  city: "Porto Alegre",
  postal_code: "90660130",
  country_id: "BR",
  state_abbr: "RS",
};
const recipient = {
  name: "Cliente Ficticio",
  phone: "11912345678",
  email: "cliente@example.com",
  document: "52998224725",
  address: "Rua Anita Garibaldi",
  number: "25",
  district: "Se",
  city: "Sao Paulo",
  postal_code: "01018020",
  country_id: "BR",
  state_abbr: "SP",
};
const volume = { height: 22, width: 22, length: 32, weight: 9.45 };
const declaration = { name: "Pulseira Tri Band", quantity: "1", unitary_value: "1215.00" };
const baseOptions = { receipt: false, own_hand: false, reverse: false, platform: "Cotador de Fretes", tags: [{ tag: "spike-sandbox", url: null }] };

function cartItem(service, volumes, { invoiceKey } = {}) {
  return {
    service,
    from: invoiceKey ? { ...sender, state_register: "1234567890" } : sender,
    to: recipient,
    products: volumes.map(() => declaration),
    volumes,
    options: {
      ...baseOptions,
      insurance_value: 1215 * volumes.length,
      non_commercial: !invoiceKey,
      ...(invoiceKey ? { invoice: { key: invoiceKey } } : {}),
    },
  };
}

await mkdir(FIXTURES, { recursive: true });

// 1. Quote (volumes mode, like the app does today)
await step("cotação", "calculate", "POST", "/api/v2/me/shipment/calculate", {
  from: { postal_code: sender.postal_code },
  to: { postal_code: recipient.postal_code },
  volumes: [
    { ...volume, height: 21.6, insurance: 1215 },
    { ...volume, height: 21.6, insurance: 1215 },
  ],
  options: { receipt: false, own_hand: false },
}, (j) => (Array.isArray(j) ? j.filter((s) => !s.error).map((s) => `${s.id}:${s.custom_price}`).join(" ") : JSON.stringify(j).slice(0, 160)));

// 2. Cart rules
await step("carrinho PAC com 2 volumes num item", "cart-pac-multivolume", "POST", "/api/v2/me/cart", cartItem(1, [volume, volume]),
  (j) => (j.id ? `ACEITO id=${j.id} price=${j.price}` : JSON.stringify(j).slice(0, 200)));
const pacA = await step("carrinho PAC volume 1", "cart-pac", "POST", "/api/v2/me/cart", cartItem(1, [volume]),
  (j) => `id=${j.id} protocol=${j.protocol} price=${j.price} status=${j.status}`);
const pacB = await step("carrinho PAC volume 2", null, "POST", "/api/v2/me/cart", cartItem(1, [volume]),
  (j) => `id=${j.id} price=${j.price}`);
const jadlogDecl = await step("carrinho Jadlog .Package com declaração", "cart-jadlog-declaration", "POST", "/api/v2/me/cart", cartItem(3, [volume, volume]),
  (j) => (j.id ? `ACEITO id=${j.id} price=${j.price}` : JSON.stringify(j).slice(0, 200)));
const jadlogNfe = await step("carrinho Jadlog .Package com NF-e", "cart-jadlog-invoice", "POST", "/api/v2/me/cart", cartItem(3, [volume, volume], { invoiceKey: "1".repeat(43) + "2" }),
  (j) => (j.id ? `ACEITO id=${j.id} price=${j.price}` : JSON.stringify(j).slice(0, 200)));
await step("listar carrinho", "cart-list", "GET", "/api/v2/me/cart", undefined,
  (j) => `itens=${(j.data ?? j).length ?? "?"}`);

// 3. Balance and purchase
await step("saldo", "balance", "GET", "/api/v2/me/balance");
const orders = [pacA.json?.id, pacB.json?.id].filter(Boolean);
await step("checkout dos 2 PAC", "checkout", "POST", "/api/v2/me/shipment/checkout", { orders });
await step("checkout repetido (clique duplo)", "checkout-already-paid", "POST", "/api/v2/me/shipment/checkout", { orders });
await step("saldo depois da compra", null, "GET", "/api/v2/me/balance");

// 4. Label generation and printing
await step("gerar etiquetas", "generate", "POST", "/api/v2/me/shipment/generate", { orders });
await step("imprimir private", "print-private", "POST", "/api/v2/me/shipment/print", { mode: "private", orders });
await step("imprimir public", "print-public", "POST", "/api/v2/me/shipment/print", { mode: "public", orders });
const file = await step("imprimir em arquivo (pdf)", "print-file", "GET", `/api/v2/me/imprimir/pdf/${orders[0]}`);

// Can the server download the label file with the token, and without it?
const fileUrl = typeof file.json === "string" ? file.json : Object.values(file.json ?? {}).find((v) => typeof v === "string" && v.startsWith("http"));
for (const [label, headers] of [["com token", { Authorization: `Bearer ${TOKEN}`, "User-Agent": USER_AGENT }], ["sem token", {}]]) {
  if (!fileUrl) break;
  const r = await fetch(fileUrl, { headers });
  const bytes = (await r.arrayBuffer()).byteLength;
  report.push(`${String(r.status).padEnd(4)} ${("baixar arquivo " + label).padEnd(42)} ${r.headers.get("content-type")} ${bytes} bytes`);
}
for (const mode of ["private", "public"]) {
  const printed = JSON.parse(await readFile(`${FIXTURES}/me-print-${mode}.json`, "utf8")).body;
  if (!printed?.url) continue;
  const r = await fetch(printed.url, { redirect: "manual" });
  report.push(`${String(r.status).padEnd(4)} ${("abrir link " + mode + " sem sessão").padEnd(42)} ${r.headers.get("content-type")} location=${r.headers.get("location") ?? "-"}`);
}

// 5. Listing and search
await step("listar envios", "orders-list", "GET", "/api/v2/me/orders?page=1", undefined,
  (j) => `total=${j.total} por_pagina=${j.per_page} status=${(j.data ?? []).map((o) => o.status).join(",")}`);
await step("buscar envio por id", "orders-search", "GET", `/api/v2/me/orders/search?q=${orders[0]}`, undefined,
  (j) => (Array.isArray(j) ? j.map((o) => `${o.status} tracking=${o.tracking}`).join(" ") : JSON.stringify(j).slice(0, 160)));
await step("detalhe do envio", "order", "GET", `/api/v2/me/orders/${orders[0]}`, undefined,
  (j) => `status=${j.status} tracking=${j.tracking} paid_at=${j.paid_at} generated_at=${j.generated_at}`);

// 6. Cancel one of the two, then clean the cart
await step("cancelar 1 PAC", "cancel", "POST", "/api/v2/me/shipment/cancel", { order: { id: orders[1], reason_id: "2", description: "Teste do cotador no sandbox" } });
await step("detalhe do cancelado", null, "GET", `/api/v2/me/orders/${orders[1]}`, undefined, (j) => `status=${j.status} canceled_at=${j.canceled_at}`);
for (const id of [jadlogDecl.json?.id, jadlogNfe.json?.id].filter(Boolean)) {
  await step("remover do carrinho", "cart-delete", "DELETE", `/api/v2/me/cart/${id}`);
}
await step("saldo final", null, "GET", "/api/v2/me/balance");

console.log(report.join("\n"));
