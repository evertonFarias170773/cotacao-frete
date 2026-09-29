# Etiqueta a partir do pedido do Vibe — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitar o nº do pedido do Vibe preenche a cotação (origem, CEP, caixas) e o contrato (documento e destinatário), com o XML da NF-e prevalecendo quando anexado.

**Architecture:** Uma rota interna protegida por sessão consulta a API do Vibe no servidor, com a chave em variável de ambiente, e devolve ao navegador só uma visão reduzida do pedido, já com as caixas calculadas pelo peso. A tela de cotação ganha o quadro "Pedido do Vibe", que preenche o formulário e guarda o pedido e o XML; o contrato recebe os dois para preencher documento e destinatário. As regras ficam em funções puras testadas com Vitest.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Zod 4, React Hook Form, Tailwind 4, Vitest, Playwright (só no scratchpad).

**Spec:** [2026-09-29-pedido-vibe-design.md](../specs/2026-09-29-pedido-vibe-design.md)

## Global Constraints

- Texto de interface, mensagens e documentação em pt-BR. Identificadores e comentários de código em inglês.
- `VIBE_API_URL` e `VIBE_API_KEY` são lidas só no servidor, em módulo com `import "server-only"`. Nenhuma variável `NEXT_PUBLIC_`.
- `VIBE_API_URL` é o endereço completo até `/pedidos`, sem barra no fim. O nome do cliente e o caminho da API **não** aparecem em arquivo versionado (o repositório é público).
- A chave nunca vai para o navegador, para log, para fixture ou para a saída de comandos. Logs do Vibe têm só o nº do pedido e o tipo de falha.
- Fixtures e testes só com dados fictícios.
- Caixa do Vibe: base 22 × 32 cm, altura = peso × 2,4 cm, valor declarado = peso × R$ 135. Os números vêm de `TRIBAND` em `src/config/products.ts`, sem repetir.
- Pedido do Vibe sai sempre de Porto Alegre (`poa`).
- Com XML, a nota prevalece: CEP cotado e destinatário vêm dela.
- A cotação manual continua igual, inclusive a origem lembrada.
- Nº do pedido validado com `^\d{1,9}$` e maior que zero antes de entrar na URL.
- Lint do React Compiler ativo: efeitos colaterais em handlers, refs atualizadas só em handlers ou efeitos. Siga os padrões de `Cotador.tsx`.
- TDD em toda lógica pura. Commits pequenos terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Testes de compra só no sandbox (`MELHOR_ENVIO_ENV=sandbox`). No Vibe real, só leitura.
- Arquivos com CRLF: use o Edit tool, não substituições por `node -e` ou `sed` com `\n`.

## Review Focus

1. **Números vindos como texto.** Um Vibe que mande `"4.95"` ou `"4,95"` em vez de `4.95` deve funcionar igual. Teste na Tarefa 1.
2. **Pedido com mais caixas do que o formulário aceita.** Mais de 20 pesos diferentes ou mais de 50 caixas iguais não podem gerar um formulário inválido: o app divide o peso igualmente e quebra em linhas de até 50. Teste na Tarefa 1.
3. **Lista de pesos incompleta ou com tamanho diferente da quantidade.** Deve cair na divisão igual do peso aferido, nunca misturar. Teste na Tarefa 1.
4. **Vibe que não responde.** A busca não pode ficar girando para sempre: 10 s de limite e a mensagem "Não foi possível falar com o Vibe agora." Teste na Tarefa 2.
5. **Enter no campo do pedido.** O campo está dentro do formulário de cotação; Enter deve buscar o pedido, não enviar a cotação. Verificado no teste de navegador da Tarefa 7.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/__fixtures__/vibe-pedido.json` | criar | Resposta fictícia do Vibe. |
| `src/lib/vibe.ts` | criar | Schema da resposta, caixas pelo peso, destinatário, comparação nota × pedido, tipos compartilhados. |
| `src/lib/vibe.test.ts` | criar | Testes das regras puras. |
| `src/lib/vibeClient.ts` | criar | Chamada ao Vibe (server-only), limite de tempo, erros. |
| `src/lib/vibeClient.test.ts` | criar | Testes da chamada. |
| `src/app/api/vibe/orders/[id]/route.ts` | criar | `GET` protegido por sessão. |
| `src/app/api/vibe/orders/[id]/route.test.ts` | criar | Testes da rota. |
| `src/app/page.tsx` | modificar | Informa se o Vibe está configurado. |
| `src/lib/recipient.ts` | modificar | `vibeOrder` no pedido do contrato; `recipientFromNfe`. |
| `src/lib/cart.ts` | modificar | `extraTags` no item do carrinho. |
| `src/lib/shipments.ts` | modificar | Marcação `Vibe {nº}`. |
| `src/lib/nfeXml.ts` | modificar | Exporta `MAX_NFE_XML_BYTES`. |
| `src/components/vibe/VibeOrderPanel.tsx` | criar | O quadro "Pedido do Vibe". |
| `src/components/Cotador.tsx` | modificar | Estado do pedido, preenchimento, travas, repasse ao contrato. |
| `src/components/OriginSelector.tsx` | modificar | Prop `locked`. |
| `src/components/DestinationInput.tsx` | modificar | Prop `readOnly`. |
| `src/components/contract/ContractDialog.tsx` | modificar | Rascunho inicial pelo Vibe/XML, `vibeOrder` no carrinho, refazer cotação. |
| `src/components/contract/DocumentStep.tsx` | modificar | Avisos nota × pedido e botão "Refazer a cotação com a nota". |
| `src/components/contract/RecipientStep.tsx` | modificar | `prefilledFrom` vira `prefilledNote`. |
| `README.md`, `.env.example` | modificar | As duas variáveis novas. |

---

### Task 1: Regras puras do pedido do Vibe

**Files:**
- Create: `src/lib/__fixtures__/vibe-pedido.json`
- Create: `src/lib/vibe.ts`
- Test: `src/lib/vibe.test.ts`

**Interfaces:**
- Consumes: `TRIBAND` (`src/config/products.ts`), `PlannedVolume` (`src/lib/presets.ts`), `RecipientInput` (`src/lib/recipient.ts`), `NfeData` (`src/lib/nfeXml.ts`), `QuoteError` (`src/lib/errors.ts`), `normalizeDocument`, `formatCep`, `onlyDigits`, `parseDecimal`.
- Produces:
  - `type BoxPlan = Omit<PlannedVolume, "unitsPerVolume">`
  - `type VibeOrder = { id: number; recipient: RecipientInput; postalCode: string; totalWeight: number; boxes: BoxPlan[] }`
  - `type LoadedNfe = { nfe: NfeData; xml: string }`
  - `type VibeSelection = { order: VibeOrder; invoice: LoadedNfe | null }`
  - `const VIBE_ORIGIN: "poa"`
  - `const vibeResponseSchema` (Zod) e `type VibeResponse = z.output<typeof vibeResponseSchema>`
  - `function boxesFromWeight(totalWeight: number | null, count: number | null, perBox: (number | null)[]): BoxPlan[]`
  - `function toVibeOrder(response: VibeResponse): VibeOrder` — lança `QuoteError(422, NOT_WEIGHED)` ou `QuoteError(422, NO_POSTAL_CODE)`
  - `function compareNfeWithVibe(nfe: NfeData, order: VibeOrder): string[]`
  - `const NOT_WEIGHED = "Esse pedido ainda não foi pesado no despacho."`
  - `const NO_POSTAL_CODE = "O pedido no Vibe não tem um CEP de entrega válido."`

- [ ] **Step 1: Criar a fixture fictícia**

`src/lib/__fixtures__/vibe-pedido.json` — o destinatário coincide com a NF-e fictícia (`nfe-ficticia.xml`), só que em maiúsculas e com acentos, para testar a comparação:

```json
{
  "id_int": 22773,
  "pagador": {
    "nome": "PAGADOR FICTICIO LTDA",
    "documento": "00000000000100",
    "email": "financeiro@example.com",
    "telefone": "51999990000",
    "endereco": { "cep": "96800000", "logradouro": "Rua Exemplo", "numero": "100", "complemento": "Sala 2", "bairro": "Centro", "cidade": "Cidade Exemplo", "uf": "RS" }
  },
  "entrega": {
    "destinatario": { "nome": "CLIENTE FICTÍCIO COMÉRCIO LTDA", "documento": "11222333000181", "email": "compras@example.com", "telefone": null },
    "recebedor": { "nome": "Maria Exemplo", "cpf": "12345678909" },
    "endereco": { "cep": "01018020", "logradouro": "Rua Anita Garibaldi", "numero": "25", "complemento": null, "bairro": "Sé", "cidade": "São Paulo", "uf": "sp" }
  },
  "valor_total": 345,
  "envio": { "modalidade": "FOB", "servico": "MELHOR ENVIO", "transportadora": { "id": 70010, "nome": "TRANSPORTADORA FICTICIA" }, "valor_frete": 0 },
  "peso_aferido_kg": 4.95,
  "volumes": {
    "quantidade": 1,
    "tipo": "Caixa",
    "lista": [{ "numero": 1, "peso_kg": null, "altura_cm": null, "largura_cm": null, "comprimento_cm": null }]
  }
}
```

- [ ] **Step 2: Escrever os testes que falham**

`src/lib/vibe.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { QuoteError } from "./errors";
import { parseNfeXml } from "./nfeXml";
import {
  NO_POSTAL_CODE,
  NOT_WEIGHED,
  boxesFromWeight,
  compareNfeWithVibe,
  toVibeOrder,
  vibeResponseSchema,
} from "./vibe";
import raw from "./__fixtures__/vibe-pedido.json";

const nbsp = (s: string) => s.replace(/ /g, " ");
const nfe = parseNfeXml(readFileSync(new URL("./__fixtures__/nfe-ficticia.xml", import.meta.url), "utf8"));
const response = (patch: (body: typeof raw) => void = () => undefined) => {
  const body = structuredClone(raw);
  patch(body);
  return vibeResponseSchema.parse(body);
};

describe("boxesFromWeight", () => {
  test("one box: the height and the declared value come from the weight", () => {
    expect(boxesFromWeight(4.95, 1, [null])).toEqual([
      { quantity: 1, width: 22, length: 32, weight: 4.95, height: 11.88, insurance: 668.25 },
    ]);
  });

  test("several boxes without their own weight split the weighed total equally", () => {
    expect(boxesFromWeight(9, 3, [null, null, null])).toEqual([
      { quantity: 3, width: 22, length: 32, weight: 3, height: 7.2, insurance: 405 },
    ]);
  });

  test("uses each box's weight when every box has one", () => {
    expect(boxesFromWeight(99, 2, [2, 5])).toEqual([
      { quantity: 1, width: 22, length: 32, weight: 2, height: 4.8, insurance: 270 },
      { quantity: 1, width: 22, length: 32, weight: 5, height: 12, insurance: 675 },
    ]);
  });

  test("a partial list of box weights falls back to the equal split", () => {
    expect(boxesFromWeight(6, 2, [2, null])).toEqual([
      { quantity: 2, width: 22, length: 32, weight: 3, height: 7.2, insurance: 405 },
    ]);
  });

  test("a list whose size differs from the box count falls back to the equal split", () => {
    expect(boxesFromWeight(6, 3, [2, 2])).toEqual([
      { quantity: 3, width: 22, length: 32, weight: 2, height: 4.8, insurance: 270 },
    ]);
  });

  test("a missing or zero box count means one box", () => {
    expect(boxesFromWeight(1, null, [])).toHaveLength(1);
    expect(boxesFromWeight(1, 0, [])[0].quantity).toBe(1);
  });

  test("rounds the split weight to grams", () => {
    const [box] = boxesFromWeight(10, 3, [null, null, null]);
    expect(box.weight).toBe(3.333);
    expect(box.height).toBe(8);
    expect(box.insurance).toBe(449.96);
  });

  test("no weight at all means nothing to fill", () => {
    expect(boxesFromWeight(null, 2, [null, null])).toEqual([]);
    expect(boxesFromWeight(0, 1, [null])).toEqual([]);
  });

  test("more distinct weights than the form holds falls back to the equal split", () => {
    const weights = Array.from({ length: 25 }, (_, index) => index + 1);
    const plan = boxesFromWeight(null, 25, weights);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ quantity: 25, weight: 13 });
  });

  test("more than 50 identical boxes are split into lines of at most 50", () => {
    const plan = boxesFromWeight(120, 120, []);
    expect(plan.map((box) => box.quantity)).toEqual([50, 50, 20]);
  });
});

describe("vibeResponseSchema", () => {
  test("accepts numbers sent as text, with dot or comma", () => {
    expect(response((b) => Object.assign(b, { peso_aferido_kg: "4.95" })).peso_aferido_kg).toBe(4.95);
    expect(response((b) => Object.assign(b, { peso_aferido_kg: "4,95" })).peso_aferido_kg).toBe(4.95);
  });

  test("null text fields become empty strings", () => {
    expect(response().entrega.destinatario.telefone).toBe("");
    expect(response().entrega.endereco.complemento).toBe("");
  });

  test("refuses a body without the delivery block", () => {
    expect(vibeResponseSchema.safeParse({ id_int: 1 }).success).toBe(false);
  });
});

describe("toVibeOrder", () => {
  test("keeps only what the app uses: recipient, CEP, weight and boxes", () => {
    expect(toVibeOrder(response())).toEqual({
      id: 22773,
      postalCode: "01018020",
      totalWeight: 4.95,
      recipient: {
        name: "CLIENTE FICTÍCIO COMÉRCIO LTDA",
        document: "11222333000181",
        phone: "",
        email: "compras@example.com",
        address: "Rua Anita Garibaldi",
        number: "25",
        complement: "",
        district: "Sé",
        city: "São Paulo",
        stateAbbr: "SP",
      },
      boxes: [{ quantity: 1, width: 22, length: 32, weight: 4.95, height: 11.88, insurance: 668.25 }],
    });
  });

  test("the total weight is the sum of the box weights when every box has one", () => {
    const order = toVibeOrder(
      response((b) => {
        b.volumes.quantidade = 2;
        b.volumes.lista = [
          { numero: 1, peso_kg: 2 as unknown as null, altura_cm: null, largura_cm: null, comprimento_cm: null },
          { numero: 2, peso_kg: 5 as unknown as null, altura_cm: null, largura_cm: null, comprimento_cm: null },
        ];
      }),
    );
    expect(order.totalWeight).toBe(7);
  });

  test("an order not weighed at dispatch is refused with a clear message", () => {
    const error = (() => {
      try {
        toVibeOrder(response((b) => Object.assign(b, { peso_aferido_kg: null })));
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(QuoteError);
    expect((error as QuoteError).status).toBe(422);
    expect((error as QuoteError).message).toBe(NOT_WEIGHED);
  });

  test("a delivery CEP without 8 digits is refused", () => {
    expect(() => toVibeOrder(response((b) => (b.entrega.endereco.cep = "0101")))).toThrow(NO_POSTAL_CODE);
  });

  test("a CEP with a hyphen is accepted", () => {
    expect(toVibeOrder(response((b) => (b.entrega.endereco.cep = "01018-020"))).postalCode).toBe("01018020");
  });
});

describe("compareNfeWithVibe", () => {
  const order = toVibeOrder(response());

  test("same recipient, ignoring case, accents and spacing, gives no warning", () => {
    expect(compareNfeWithVibe(nfe, order)).toEqual([]);
  });

  test("warns about a different CEP, saying the invoice wins", () => {
    const other = { ...order, postalCode: "90010000" };
    expect(compareNfeWithVibe(nfe, other).map(nbsp)).toEqual([
      "O CEP da nota (01018-020) é diferente do CEP do pedido 22773 (90010-000). A cotação usa o CEP da nota.",
    ]);
  });

  test("warns about a different name and a different document", () => {
    const other = { ...order, recipient: { ...order.recipient, name: "Outra Loja LTDA", document: "52998224725" } };
    expect(compareNfeWithVibe(nfe, other)).toEqual([
      "O destinatário da nota (Cliente Ficticio Comercio LTDA) é diferente do cliente do pedido 22773 (Outra Loja LTDA). A etiqueta usa o da nota.",
      "O CPF/CNPJ do destinatário da nota é diferente do cadastrado no pedido 22773. A etiqueta usa o da nota.",
    ]);
  });

  test("an order without a document does not warn about it", () => {
    const other = { ...order, recipient: { ...order.recipient, document: "" } };
    expect(compareNfeWithVibe(nfe, other)).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/vibe.test.ts`
Expected: FAIL — `Cannot find module './vibe'` (ou equivalente).

- [ ] **Step 4: Implementar `src/lib/vibe.ts`**

```ts
import { z } from "zod";
import { TRIBAND } from "@/config/products";
import { normalizeDocument } from "./documents";
import { QuoteError } from "./errors";
import { formatCep, onlyDigits, parseDecimal } from "./format";
import type { NfeData } from "./nfeXml";
import type { PlannedVolume } from "./presets";
import type { RecipientInput } from "./recipient";

/** Orders from the Vibe always leave from Porto Alegre. */
export const VIBE_ORIGIN = "poa" as const;

export const NOT_WEIGHED = "Esse pedido ainda não foi pesado no despacho.";
export const NO_POSTAL_CODE = "O pedido no Vibe não tem um CEP de entrega válido.";

/** The quote form holds at most 20 volume lines of at most 50 identical boxes each. */
const MAX_LINES = 20;
const MAX_PER_LINE = 50;

/**
 * Every order leaves in the same box: the Triband base, with the height growing with the weight.
 * The Triband numbers per unit are the same numbers per kg (2.4 cm and R$ 135).
 */
const BOX = { width: TRIBAND.width, length: TRIBAND.length, heightPerKg: TRIBAND.unitHeight, valuePerKg: TRIBAND.unitPrice };

export type BoxPlan = Omit<PlannedVolume, "unitsPerVolume">;

export type VibeOrder = {
  id: number;
  recipient: RecipientInput;
  /** Delivery CEP, 8 digits. */
  postalCode: string;
  /** Weighed at dispatch, in kg. */
  totalWeight: number;
  boxes: BoxPlan[];
};

/** An NF-e XML read on the device, kept with its text because Azul Cargo needs it. */
export type LoadedNfe = { nfe: NfeData; xml: string };

/** The Vibe order loaded on the quote screen, and the invoice attached to it, if any. */
export type VibeSelection = { order: VibeOrder; invoice: LoadedNfe | null };

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

/** The Vibe sends null for missing data; the app works with empty strings. */
const text = z
  .string()
  .nullish()
  .transform((value) => value?.trim() ?? "");

/** Numbers may come as numbers or as text with a dot or a comma. */
const decimal = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => (value === null || value === undefined ? null : typeof value === "number" ? value : parseDecimal(value)));

const addressSchema = z.looseObject({
  cep: text,
  logradouro: text,
  numero: text,
  complemento: text,
  bairro: text,
  cidade: text,
  uf: text,
});

/** The parts of GET /pedidos/{id_int} the app reads. Everything else is ignored. */
export const vibeResponseSchema = z.looseObject({
  id_int: z.coerce.number().int().positive(),
  entrega: z.looseObject({
    destinatario: z.looseObject({ nome: text, documento: text, email: text, telefone: text }),
    endereco: addressSchema,
  }),
  peso_aferido_kg: decimal,
  volumes: z
    .looseObject({
      quantidade: decimal,
      lista: z.array(z.looseObject({ peso_kg: decimal })).nullish(),
    })
    .nullish(),
});

export type VibeResponse = z.output<typeof vibeResponseSchema>;

function box(weight: number, quantity: number): BoxPlan {
  return {
    quantity,
    width: BOX.width,
    length: BOX.length,
    weight: round(weight, 3),
    height: round(weight * BOX.heightPerKg, 2),
    insurance: round(weight * BOX.valuePerKg, 2),
  };
}

/** Groups consecutive equal weights into form lines of at most 50 boxes. */
function group(weights: number[]): BoxPlan[] {
  const plan: BoxPlan[] = [];
  for (const weight of weights) {
    const previous = plan[plan.length - 1];
    if (previous && previous.weight === round(weight, 3) && previous.quantity < MAX_PER_LINE) previous.quantity += 1;
    else plan.push(box(weight, 1));
  }
  return plan;
}

/**
 * The boxes of an order, from its weight: each box's own weight when the Vibe has all of them,
 * otherwise the weighed total split equally. Empty when there is no weight at all.
 */
export function boxesFromWeight(totalWeight: number | null, count: number | null, perBox: (number | null)[]): BoxPlan[] {
  const boxes = Math.max(1, Math.trunc(count ?? 1));
  const known = perBox.length === boxes && perBox.every((weight) => weight !== null && weight > 0);
  const total = known ? perBox.reduce<number>((sum, weight) => sum + (weight ?? 0), 0) : (totalWeight ?? 0);
  if (!(total > 0)) return [];

  const equalSplit = () => group(Array.from({ length: boxes }, () => round(total / boxes, 3)));
  if (!known) return equalSplit();
  const plan = group(perBox as number[]);
  return plan.length > MAX_LINES ? equalSplit() : plan;
}

/** The reduced view of an order that goes to the browser. */
export function toVibeOrder(response: VibeResponse): VibeOrder {
  const perBox = response.volumes?.lista?.map((item) => item.peso_kg) ?? [];
  const boxes = boxesFromWeight(response.peso_aferido_kg, response.volumes?.quantidade ?? null, perBox);
  if (boxes.length === 0) throw new QuoteError(422, NOT_WEIGHED);

  const address = response.entrega.endereco;
  const postalCode = onlyDigits(address.cep);
  if (postalCode.length !== 8) throw new QuoteError(422, NO_POSTAL_CODE);

  const person = response.entrega.destinatario;
  return {
    id: response.id_int,
    postalCode,
    totalWeight: round(boxes.reduce((sum, item) => sum + item.weight * item.quantity, 0), 3),
    recipient: {
      name: person.nome,
      document: normalizeDocument(person.documento),
      phone: onlyDigits(person.telefone),
      email: person.email,
      address: address.logradouro,
      number: address.numero,
      complement: address.complemento,
      district: address.bairro,
      city: address.cidade,
      stateAbbr: address.uf.toUpperCase(),
    },
    boxes,
  };
}

/** Names compare without case, accents or repeated spaces ("CLIENTE FICTÍCIO" = "Cliente Ficticio"). */
const comparableName = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Differences between the invoice and the order. They only warn: the invoice always wins. */
export function compareNfeWithVibe(nfe: NfeData, order: VibeOrder): string[] {
  const warnings: string[] = [];
  const invoice = nfe.recipient;
  if (invoice.postalCode !== order.postalCode) {
    warnings.push(
      `O CEP da nota (${formatCep(invoice.postalCode)}) é diferente do CEP do pedido ${order.id} (${formatCep(order.postalCode)}). A cotação usa o CEP da nota.`,
    );
  }
  if (comparableName(invoice.name) !== comparableName(order.recipient.name)) {
    warnings.push(
      `O destinatário da nota (${invoice.name}) é diferente do cliente do pedido ${order.id} (${order.recipient.name}). A etiqueta usa o da nota.`,
    );
  }
  if (order.recipient.document && normalizeDocument(invoice.document) !== normalizeDocument(order.recipient.document)) {
    warnings.push(`O CPF/CNPJ do destinatário da nota é diferente do cadastrado no pedido ${order.id}. A etiqueta usa o da nota.`);
  }
  return warnings;
}
```

Observação: o teste "the total weight is the sum…" recebe `totalWeight: 7` pela soma das caixas; o teste de 4,95 kg recebe 4,95 pela divisão igual. Os dois saem da mesma soma `peso × quantidade` das caixas.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/vibe.test.ts`
Expected: PASS (todos). Se o teste de 25 pesos falhar por arredondamento, confira: soma 1..25 = 325; 325/25 = 13.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vibe.ts src/lib/vibe.test.ts src/lib/__fixtures__/vibe-pedido.json
git commit -m "feat: regras do pedido do Vibe (caixas pelo peso, destinatário, conferência com a nota)"
```

---

### Task 2: Chamada ao Vibe no servidor

**Files:**
- Create: `src/lib/vibeClient.ts`
- Test: `src/lib/vibeClient.test.ts`
- Modify: `.env.example`, `README.md`

**Interfaces:**
- Consumes: `vibeResponseSchema`, `toVibeOrder`, `VibeOrder` (Task 1); `QuoteError`.
- Produces:
  - `function vibeConfigured(): boolean`
  - `async function fetchVibeOrder(id: number): Promise<VibeOrder>` — lança `QuoteError` com status 404, 429, 422, 502 ou 503
  - `const VIBE_UNAVAILABLE = "Não foi possível falar com o Vibe agora."`

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/vibeClient.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { QuoteError } from "./errors";
import { NOT_WEIGHED } from "./vibe";
import { VIBE_UNAVAILABLE, fetchVibeOrder, vibeConfigured } from "./vibeClient";
import raw from "./__fixtures__/vibe-pedido.json";

const KEY = "chave-de-teste-123";

function stubFetch(reply: () => Response | Promise<Response>) {
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: new Headers(init.headers) });
      return reply();
    }),
  );
  return calls;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function failure(promise: Promise<unknown>): Promise<QuoteError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof QuoteError) return error;
    throw error;
  }
  throw new Error("expected a QuoteError");
}

beforeEach(() => {
  vi.stubEnv("VIBE_API_URL", "https://vibe.example.com/api/v1/cliente/pedidos/");
  vi.stubEnv("VIBE_API_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("vibeConfigured", () => {
  test("needs both the address and the key", () => {
    expect(vibeConfigured()).toBe(true);
    vi.stubEnv("VIBE_API_KEY", "  ");
    expect(vibeConfigured()).toBe(false);
  });
});

describe("fetchVibeOrder", () => {
  test("asks the Vibe for the order with the key header and returns the reduced order", async () => {
    const calls = stubFetch(() => json(200, raw));
    const order = await fetchVibeOrder(22773);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://vibe.example.com/api/v1/cliente/pedidos/22773");
    expect(calls[0].headers.get("x-api-key")).toBe(KEY);
    expect(order.id).toBe(22773);
    expect(JSON.stringify(order)).not.toContain("PAGADOR");
  });

  test("not configured: 503 without calling anyone", async () => {
    vi.stubEnv("VIBE_API_URL", "");
    const calls = stubFetch(() => json(200, raw));
    const error = await failure(fetchVibeOrder(1));
    expect(error.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  test.each([
    [404, 404, "Pedido não encontrado."],
    [429, 429, "Muitas consultas seguidas. Espere 1 minuto."],
    [401, 502, "O Vibe recusou a chave de acesso. Confira a configuração."],
    [500, 502, VIBE_UNAVAILABLE],
  ])("Vibe HTTP %i becomes %i with a readable message", async (vibeStatus, status, message) => {
    stubFetch(() => json(vibeStatus, { erro: "x", mensagem: "y" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = await failure(fetchVibeOrder(22773));
    expect(error.status).toBe(status);
    expect(error.message).toBe(message);
  });

  test("a network failure or timeout gives the unavailable message", async () => {
    stubFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = await failure(fetchVibeOrder(22773));
    expect(error.status).toBe(502);
    expect(error.message).toBe(VIBE_UNAVAILABLE);
  });

  test("an unexpected body gives the unavailable message", async () => {
    stubFetch(() => json(200, { algo: "diferente" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await failure(fetchVibeOrder(22773))).message).toBe(VIBE_UNAVAILABLE);
  });

  test("an order not weighed yet keeps its own message", async () => {
    stubFetch(() => json(200, { ...raw, peso_aferido_kg: null }));
    const error = await failure(fetchVibeOrder(22773));
    expect(error.status).toBe(422);
    expect(error.message).toBe(NOT_WEIGHED);
  });

  test("logs carry the order number, never the key or personal data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubFetch(() => json(401, {}));
    await failure(fetchVibeOrder(22773));
    stubFetch(() => json(200, { ...raw, entrega: "quebrado" }));
    await failure(fetchVibeOrder(22773));
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("22773");
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("CLIENTE");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/vibeClient.test.ts`
Expected: FAIL — módulo `./vibeClient` não existe.

- [ ] **Step 3: Implementar `src/lib/vibeClient.ts`**

```ts
import "server-only";
import { QuoteError } from "./errors";
import { toVibeOrder, vibeResponseSchema, type VibeOrder } from "./vibe";

const TIMEOUT_MS = 10_000;

export const VIBE_UNAVAILABLE = "Não foi possível falar com o Vibe agora.";

/** VIBE_API_URL is the full address up to /pedidos, so no client name lives in the code. */
function vibeConfig(): { url: string; key: string } | null {
  const url = process.env.VIBE_API_URL?.trim().replace(/\/+$/, "");
  const key = process.env.VIBE_API_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function vibeConfigured(): boolean {
  return vibeConfig() !== null;
}

/** Logs only the order number and what went wrong: never the key, names or addresses. */
function logFailure(id: number, reason: string) {
  console.error(`[vibe] pedido ${id}: ${reason}`);
}

async function getJson(url: string, key: string): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "x-api-key": key },
      signal: controller.signal,
      cache: "no-store",
    });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One order from the Vibe, reduced to what the quote and the label need. Read-only. */
export async function fetchVibeOrder(id: number): Promise<VibeOrder> {
  const config = vibeConfig();
  if (!config) throw new QuoteError(503, "A integração com o Vibe não está configurada.");

  const response = await getJson(`${config.url}/${id}`, config.key);
  if (!response) {
    logFailure(id, "sem resposta");
    throw new QuoteError(502, VIBE_UNAVAILABLE);
  }
  if (response.status === 404) throw new QuoteError(404, "Pedido não encontrado.");
  if (response.status === 429) throw new QuoteError(429, "Muitas consultas seguidas. Espere 1 minuto.");
  if (response.status === 401) {
    logFailure(id, "chave recusada");
    throw new QuoteError(502, "O Vibe recusou a chave de acesso. Confira a configuração.");
  }
  if (response.status < 200 || response.status >= 300) {
    logFailure(id, `HTTP ${response.status}`);
    throw new QuoteError(502, VIBE_UNAVAILABLE);
  }

  const parsed = vibeResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    logFailure(id, "resposta inesperada");
    throw new QuoteError(502, VIBE_UNAVAILABLE);
  }
  return toVibeOrder(parsed.data);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/vibeClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Documentar as variáveis**

Em `.env.example`, ao final:

```
# Integração com o Vibe (busca de pedido para cotação e etiqueta). Opcional: sem as duas, o quadro não aparece.
# Endereço completo até /pedidos, sem barra no fim.
VIBE_API_URL=
# Chave de acesso entregue pelo Vibe. Nunca em arquivo versionado.
VIBE_API_KEY=
```

Em `README.md`, na tabela de variáveis, depois de `SENDERS_JSON`:

```
| `VIBE_API_URL` | Endereço completo da API de pedidos do Vibe, até `/pedidos`, sem barra no fim. Opcional. |
| `VIBE_API_KEY` | Chave de acesso à API do Vibe. Sem ela e sem a URL, o quadro "Pedido do Vibe" não aparece. |
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/vibeClient.ts src/lib/vibeClient.test.ts .env.example README.md
git commit -m "feat: consulta de pedido no Vibe feita só no servidor"
```

---

### Task 3: Rota interna e aviso de configuração para a tela

**Files:**
- Create: `src/app/api/vibe/orders/[id]/route.ts`
- Test: `src/app/api/vibe/orders/[id]/route.test.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `fetchVibeOrder`, `vibeConfigured` (Task 2); `requireSession`; `errorResponse`.
- Produces: `GET /api/vibe/orders/{id}` → `200 { order: VibeOrder }` ou `{ error: string }` com 400/401/404/422/429/502/503. `Cotador` recebe a prop `vibeEnabled: boolean`.

- [ ] **Step 1: Escrever os testes que falham**

`src/app/api/vibe/orders/[id]/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { authedRequest, useTestSession } from "@/test/session";
import raw from "@/lib/__fixtures__/vibe-pedido.json";
import { GET } from "./route";

const KEY = "chave-de-teste-123";
const url = (id: string) => `http://localhost/api/vibe/orders/${id}`;
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function stubVibe(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useTestSession();
  vi.stubEnv("VIBE_API_URL", "https://vibe.example.com/pedidos");
  vi.stubEnv("VIBE_API_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/vibe/orders/[id]", () => {
  test("returns the reduced order, without the payer or the key", async () => {
    stubVibe(200, raw);
    const response = await GET(await authedRequest(url("22773")), context("22773"));
    expect(response.status).toBe(200);
    const text = await response.text();
    const { order } = JSON.parse(text) as { order: { id: number; boxes: unknown[] } };
    expect(order.id).toBe(22773);
    expect(order.boxes).toHaveLength(1);
    expect(text).not.toContain("PAGADOR");
    expect(text).not.toContain("valor_total");
    expect(text).not.toContain(KEY);
  });

  test("requires a session and does not call the Vibe without one", async () => {
    const fetchMock = stubVibe(200, raw);
    expect((await GET(new Request(url("22773")), context("22773"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(["abc", "0", "1234567890", "12.3", "-5"])("refuses %s as an order number", async (id) => {
    const fetchMock = stubVibe(200, raw);
    const response = await GET(await authedRequest(url(id)), context(id));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Informe o número do pedido." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an unknown order answers 404 with the message", async () => {
    stubVibe(404, { erro: "nao_encontrado", mensagem: "Pedido não encontrado." });
    const response = await GET(await authedRequest(url("1")), context("1"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Pedido não encontrado." });
  });

  test("without configuration answers 503", async () => {
    vi.stubEnv("VIBE_API_KEY", "");
    stubVibe(200, raw);
    expect((await GET(await authedRequest(url("1")), context("1"))).status).toBe(503);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/api/vibe"`
Expected: FAIL — `./route` não existe.

- [ ] **Step 3: Implementar a rota**

`src/app/api/vibe/orders/[id]/route.ts` (mesmo padrão de `src/app/api/shipments/[id]/cancel/route.ts`):

```ts
import { requireSession } from "@/lib/requireSession";
import { errorResponse } from "@/lib/routeHelpers";
import { fetchVibeOrder } from "@/lib/vibeClient";

const ORDER_NUMBER = /^\d{1,9}$/;

/** GET /api/vibe/orders/22773 — the Vibe order reduced to what the quote and the label need. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const raw = (await context.params).id;
  const id = ORDER_NUMBER.test(raw) ? Number(raw) : 0;
  if (id <= 0) return Response.json({ error: "Informe o número do pedido." }, { status: 400 });

  try {
    return Response.json({ order: await fetchVibeOrder(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "api/vibe/orders");
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run "src/app/api/vibe"`
Expected: PASS.

- [ ] **Step 5: Informar a tela se o Vibe está configurado**

`src/app/page.tsx`:

```tsx
import { Cotador } from "@/components/Cotador";
import { vibeConfigured } from "@/lib/vibeClient";

export default function Home() {
  return <Cotador vibeEnabled={vibeConfigured()} />;
}
```

Em `src/components/Cotador.tsx`, só a assinatura por enquanto (o uso vem na Task 5):

```tsx
export function Cotador({ vibeEnabled = false }: { vibeEnabled?: boolean }) {
```

Run: `npx tsc --noEmit` — Expected: sem erros. (O lint pode reclamar de `vibeEnabled` sem uso; tudo bem até a Task 5, ou use-o já com `void vibeEnabled` — prefira seguir direto para a Task 5 antes do lint.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/vibe" src/app/page.tsx src/components/Cotador.tsx
git commit -m "feat: rota interna do pedido do Vibe, protegida por login"
```

---

### Task 4: Marcação `Vibe {nº}` no envio e destinatário a partir da nota

**Files:**
- Modify: `src/lib/recipient.ts`, `src/lib/cart.ts`, `src/lib/shipments.ts`
- Test: `src/lib/recipient.test.ts`, `src/lib/cart.test.ts`, `src/lib/shipments.test.ts`

**Interfaces:**
- Consumes: `NfeRecipient` (`src/lib/nfeXml.ts`).
- Produces:
  - `contractRequestSchema` aceita `vibeOrder?: number` (inteiro, 1 a 999999999).
  - `BuildCartInput.extraTags?: string[]` — cada um vira `{ tag, url: null }` depois da marcação principal.
  - `function recipientFromNfe(recipient: NfeRecipient): RecipientInput`

- [ ] **Step 1: Testes que falham**

Em `src/lib/cart.test.ts`, depois do teste "forwards the additional services and tags the order":

```ts
  test("extra tags follow the app tag", () => {
    const [item] = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "cotador", extraTags: ["Vibe 22773"] });
    expect(item.options.tags).toEqual([
      { tag: "cotador", url: null },
      { tag: "Vibe 22773", url: null },
    ]);
  });
```

Em `src/lib/shipments.test.ts`, dentro de `describe("addToCart")`:

```ts
  test("an order from the Vibe is tagged with its number, keeping the app tag", async () => {
    const { calls } = fakeMelhorEnvio([{ method: "POST", path: /\/cart$/, reply: () => jsonResponse(201, cartPac) }]);
    const single = { ...contract.quote, volumes: [{ ...contract.quote.volumes[0], quantity: 1 }] };
    await addToCart({ ...contract, quote: single, vibeOrder: 22773 });
    const sent = calls[0].body as { options: { tags: { tag: string }[] } };
    expect(sent.options.tags.map((t) => t.tag)).toEqual([APP_TAG, "Vibe 22773"]);
  });
```

Em `src/lib/recipient.test.ts` (importe `recipientFromNfe` e `contractRequestSchema` se ainda não estiverem, e `readFileSync` + `parseNfeXml`):

```ts
describe("recipientFromNfe", () => {
  test("fills every recipient field from the invoice", () => {
    const nfe = parseNfeXml(readFileSync(new URL("./__fixtures__/nfe-ficticia.xml", import.meta.url), "utf8"));
    expect(recipientFromNfe(nfe.recipient)).toEqual({
      name: "Cliente Ficticio Comercio LTDA",
      document: "11222333000181",
      phone: "1133334444",
      email: "compras@example.com",
      address: "Rua Anita Garibaldi",
      number: "25",
      complement: "Sala 2",
      district: "Se",
      city: "Sao Paulo",
      stateAbbr: "SP",
    });
  });
});

describe("contractRequestSchema vibeOrder", () => {
  test.each([0, -1, 1.5, 1_000_000_000])("refuses %s as a Vibe order", (vibeOrder) => {
    expect(contractRequestSchema.shape.vibeOrder.safeParse(vibeOrder).success).toBe(false);
  });

  test("is optional", () => {
    expect(contractRequestSchema.shape.vibeOrder.safeParse(undefined).success).toBe(true);
  });
});
```

(Se `recipientFromNfe` devolver `document` já normalizado ou não, o teste acima usa o valor do XML fictício, que já vem só com dígitos.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/cart.test.ts src/lib/shipments.test.ts src/lib/recipient.test.ts`
Expected: FAIL — `extraTags` ignorado, `vibeOrder` desconhecido, `recipientFromNfe` não existe.

- [ ] **Step 3: Implementar**

`src/lib/cart.ts` — em `BuildCartInput`, depois de `tag`:

```ts
  /** More references for the Melhor Envio panel, after the app tag (e.g. "Vibe 22773"). */
  extraTags?: string[];
```

Em `buildCartItems`, desestruture `extraTags = []` e troque a linha de `tags`:

```ts
        tags: [tag, ...extraTags].map((value) => ({ tag: value, url: null })),
```

`src/lib/recipient.ts` — em `contractRequestSchema`, depois de `agencyId`:

```ts
  /** Vibe order the shipment came from; becomes a tag in the Melhor Envio panel. */
  vibeOrder: z.number().int().positive().max(999_999_999).optional(),
```

E, depois de `toRecipientParty`:

```ts
/** The recipient form filled from an NF-e XML; the invoice always wins over other sources. */
export function recipientFromNfe(recipient: NfeRecipient): RecipientInput {
  return {
    name: recipient.name,
    document: recipient.document,
    phone: recipient.phone,
    email: recipient.email,
    address: recipient.address,
    number: recipient.number,
    complement: recipient.complement,
    district: recipient.district,
    city: recipient.city,
    stateAbbr: recipient.stateAbbr,
  };
}
```

com `import type { NfeRecipient } from "./nfeXml";` no topo.

`src/lib/shipments.ts` — em `addToCart`, na chamada de `buildCartItems`, depois de `tag: APP_TAG,`:

```ts
      extraTags: contract.vibeOrder ? [`Vibe ${contract.vibeOrder}`] : [],
```

`src/components/contract/DocumentStep.tsx` — troque o objeto `recipient: { name: nfe.recipient.name, … }` montado à mão em `next()` por `recipient: recipientFromNfe(nfe.recipient)` (import de `@/lib/recipient`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run` e `npx tsc --noEmit`
Expected: todos passam, sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart.ts src/lib/cart.test.ts src/lib/recipient.ts src/lib/recipient.test.ts src/lib/shipments.ts src/lib/shipments.test.ts src/components/contract/DocumentStep.tsx
git commit -m "feat: envio do Vibe ganha a marcação com o nº do pedido"
```

---

### Task 5: Quadro "Pedido do Vibe" na tela de cotação

**Files:**
- Create: `src/components/vibe/VibeOrderPanel.tsx`
- Modify: `src/components/Cotador.tsx`, `src/components/OriginSelector.tsx`, `src/components/DestinationInput.tsx`, `src/lib/nfeXml.ts`, `src/components/contract/DocumentStep.tsx`

**Interfaces:**
- Consumes: `VibeOrder`, `VibeSelection`, `LoadedNfe`, `BoxPlan`, `VIBE_ORIGIN`, `compareNfeWithVibe` (Task 1); `GET /api/vibe/orders/{id}` (Task 3); `callApi`; `parseNfeXml`, `NfeXmlError`.
- Produces:
  - `VibeOrderPanel` com props `{ selection: VibeSelection | null; disabled: boolean; onLoad(order: VibeOrder): void; onInvoice(invoice: LoadedNfe): void; onClear(): void }`
  - `OriginSelector` com prop `locked?: boolean`; `DestinationInput` com prop `readOnly?: boolean`
  - `Cotador` guarda `vibe: VibeSelection | null` e expõe `attachVibeInvoice(invoice: LoadedNfe)` para a Task 6.
  - `export const MAX_NFE_XML_BYTES = 2 * 1024 * 1024` em `src/lib/nfeXml.ts`.

Sem teste de unidade (o Vitest roda em `node`, sem DOM). A verificação é `tsc`, lint e o teste de navegador da Task 7.

- [ ] **Step 1: Tamanho máximo do XML num lugar só**

Em `src/lib/nfeXml.ts`, depois de `export class NfeXmlError extends Error {}`:

```ts
/** No real NF-e XML comes close to this; bigger files are refused before reading. */
export const MAX_NFE_XML_BYTES = 2 * 1024 * 1024;
```

Em `DocumentStep.tsx`, apague `const MAX_XML_BYTES = 2 * 1024 * 1024;` e use `MAX_NFE_XML_BYTES` (importado de `@/lib/nfeXml`).

- [ ] **Step 2: Travas de origem e CEP**

`OriginSelector.tsx`:

```tsx
export function OriginSelector({ locked = false }: { locked?: boolean }) {
```

No `<button>`, acrescente `disabled={locked}` e, na classe, `disabled:cursor-not-allowed disabled:opacity-60` (a opção ativa continua destacada). Depois do `</div>` do radiogroup, envolva num fragmento e acrescente:

```tsx
      {locked && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Pedidos do Vibe saem sempre de Porto Alegre.</p>
      )}
```

`DestinationInput.tsx`:

```tsx
export function DestinationInput({ readOnly = false }: { readOnly?: boolean }) {
```

No `<input>`: `readOnly={readOnly}` e acrescente à classe `${readOnly ? "bg-zinc-100 dark:bg-zinc-800" : ""}`.

- [ ] **Step 3: Criar `src/components/vibe/VibeOrderPanel.tsx`**

```tsx
"use client";

import { FileCode2, PackageSearch, X } from "lucide-react";
import { useState } from "react";
import { callApi } from "@/lib/apiClient";
import { formatCep, formatKg, onlyDigits } from "@/lib/format";
import { MAX_NFE_XML_BYTES, NfeXmlError, parseNfeXml } from "@/lib/nfeXml";
import { compareNfeWithVibe, type LoadedNfe, type VibeOrder, type VibeSelection } from "@/lib/vibe";

type Props = {
  selection: VibeSelection | null;
  disabled: boolean;
  onLoad: (order: VibeOrder) => void;
  onInvoice: (invoice: LoadedNfe) => void;
  onClear: () => void;
};

/** Fills the quote (and later the label) from a Vibe order number, with an optional NF-e XML. */
export function VibeOrderPanel({ selection, disabled, onLoad, onInvoice, onClear }: Props) {
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function search() {
    const digits = onlyDigits(number);
    if (!digits) {
      setError("Informe o número do pedido.");
      return;
    }
    setBusy(true);
    setError(null);
    setFileError(null);
    try {
      const { order } = await callApi<{ order: VibeOrder }>(`/api/vibe/orders/${digits}`);
      onLoad(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível falar com o Vibe agora.");
    } finally {
      setBusy(false);
    }
  }

  async function readXml(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_NFE_XML_BYTES) {
      setFileError("Arquivo grande demais para um XML de NF-e.");
      return;
    }
    try {
      const xml = await file.text();
      onInvoice({ nfe: parseNfeXml(xml), xml });
    } catch (err) {
      setFileError(err instanceof NfeXmlError ? err.message : "Não foi possível ler o arquivo.");
    }
  }

  const order = selection?.order;
  const invoice = selection?.invoice;
  const boxes = order?.boxes.reduce((total, box) => total + box.quantity, 0) ?? 0;
  const warnings = order && invoice ? compareNfeWithVibe(invoice.nfe, order) : [];

  return (
    <section className="card space-y-3 p-4" aria-labelledby="vibe-title">
      <h2 id="vibe-title" className="flex items-center gap-2 text-base font-semibold">
        <PackageSearch className="h-5 w-5 text-accent-fg" aria-hidden />
        Pedido do Vibe
      </h2>

      {!order && (
        <>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Para ir direto à etiqueta: o pedido preenche a cotação.</p>
          <div className="flex gap-2">
            <label htmlFor="vibe-order" className="sr-only">
              Número do pedido no Vibe
            </label>
            <input
              id="vibe-order"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Nº do pedido"
              value={number}
              onChange={(event) => setNumber(onlyDigits(event.target.value).slice(0, 9))}
              onKeyDown={(event) => {
                // The field sits inside the quote form: Enter searches the order instead of quoting.
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
              disabled={busy || disabled}
              className="field flex-1"
            />
            <button type="button" onClick={() => void search()} disabled={busy || disabled} className="btn-primary px-4">
              {busy ? "Buscando…" : "Buscar"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </>
      )}

      {order && (
        <>
          <div className="space-y-0.5 text-sm" data-testid="vibe-summary">
            <p className="font-semibold">
              Pedido {order.id} · {order.recipient.name}
            </p>
            <p className="text-zinc-600 dark:text-zinc-300">
              {order.recipient.city}/{order.recipient.stateAbbr} · CEP {formatCep(order.postalCode)}
            </p>
            <p className="text-zinc-600 dark:text-zinc-300">
              {formatKg(order.totalWeight)} em {boxes} {boxes === 1 ? "caixa" : "caixas"}
            </p>
          </div>

          {invoice && (
            <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-fg">
              NF-e nº {invoice.nfe.number} anexada: o CEP e o destinatário vêm da nota.
            </p>
          )}
          {warnings.map((warning) => (
            <p key={warning} className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {warning}
            </p>
          ))}
          {fileError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {fileError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <label htmlFor="vibe-xml" className="btn-secondary inline-flex cursor-pointer items-center gap-2 px-3">
              <FileCode2 className="h-4 w-4" aria-hidden />
              {invoice ? "Trocar XML" : "Anexar XML"}
            </label>
            <input
              id="vibe-xml"
              type="file"
              accept=".xml,text/xml,application/xml"
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                void readXml(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => {
                setNumber("");
                setError(null);
                setFileError(null);
                onClear();
              }}
              disabled={disabled}
              className="btn-secondary inline-flex items-center gap-2 px-3"
            >
              <X className="h-4 w-4" aria-hidden />
              Limpar
            </button>
          </div>
        </>
      )}
    </section>
  );
}
```

Antes de usar, confira em `src/app/globals.css` os nomes reais das classes de botão (`btn-primary`, `btn-secondary`, `field`, `card`). Se algum não existir, use o que `StepShell.tsx` e `QuoteButton.tsx` usam. `formatKg` existe em `src/lib/format.ts`.

- [ ] **Step 4: Ligar o quadro no `Cotador`**

Em `src/components/Cotador.tsx`:

1. Imports: `VibeOrderPanel`; `VIBE_ORIGIN, type BoxPlan, type LoadedNfe, type VibeOrder, type VibeSelection` de `@/lib/vibe`.
2. Troque `applyPreset(plan: PlannedVolume[])` por `applyPreset(plan: BoxPlan[])` (o `PlannedVolume` é compatível: tem os mesmos campos e mais um) e extraia a conversão:

```tsx
const toVolumeInput = (volume: BoxPlan): VolumeFormInput => ({
  height: toFormText(volume.height),
  width: toFormText(volume.width),
  length: toFormText(volume.length),
  weight: toFormText(volume.weight),
  insurance: toFormText(volume.insurance),
  quantity: String(volume.quantity),
});
```

(fora do componente, depois de `toFormText`), e use `volumes.replace(plan.map(toVolumeInput))` em `applyPreset`. Apague o `import type { PlannedVolume } from "@/lib/presets";`, que fica sem uso.

3. Estado, depois de `contracting`:

```tsx
  // The Vibe order on screen (and its invoice). While set, origin and CEP come from it.
  const [vibe, setVibe] = useState<VibeSelection | null>(null);
  // Read inside submit, which may run in the same tick the order was loaded.
  const vibeActive = useRef(false);
```

4. Em `submit`, troque `saveLastOrigin(data.originId);` por:

```tsx
      // A Vibe order always leaves from Porto Alegre; that must not become the remembered origin.
      if (!vibeActive.current) saveLastOrigin(data.originId);
```

5. Funções novas (antes de `newQuote`) e ajustes:

```tsx
  function leaveVibe() {
    const wasActive = vibeActive.current;
    vibeActive.current = false;
    setVibe(null);
    return wasActive;
  }

  function loadVibeOrder(order: VibeOrder) {
    vibeActive.current = true;
    setVibe({ order, invoice: null });
    reset({
      originId: VIBE_ORIGIN,
      destinationCep: formatCep(order.postalCode),
      volumes: order.boxes.map(toVolumeInput),
      options: getValues("options"),
    });
    startQuote();
  }

  /** The invoice wins: its CEP replaces the order's, and the quote recalculates by itself. */
  function attachVibeInvoice(invoice: LoadedNfe) {
    setVibe((current) => (current ? { ...current, invoice } : current));
    setValue("destinationCep", formatCep(invoice.nfe.recipient.postalCode), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }
```

`newQuote` passa a sair do modo Vibe e, se estava nele, volta a origem lembrada:

```tsx
  function newQuote() {
    const lastOrigin = leaveVibe() ? loadLastOrigin() : null;
    reset({
      originId: lastOrigin ?? getValues("originId"),
      destinationCep: "",
      volumes: [emptyVolume()],
      options: { receipt: false, own_hand: false },
    });
    setQuote(null);
    setFailure(null);
  }
```

`repeat(entry)` começa com `leaveVibe();`.

6. JSX: logo depois de `</header>` e antes da seção 1:

```tsx
          {vibeEnabled && (
            <VibeOrderPanel
              selection={vibe}
              disabled={loading}
              onLoad={loadVibeOrder}
              onInvoice={attachVibeInvoice}
              onClear={newQuote}
            />
          )}
```

`<OriginSelector locked={vibe !== null} />` e `<DestinationInput readOnly={vibe !== null} />`.

7. Se o CEP não mudou ao anexar o XML, nada é recotado (a assinatura do formulário é a mesma) — correto, o preço não muda.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run`
Expected: sem erros; todos os testes passam.

- [ ] **Step 6: Commit**

```bash
git add src/components src/lib/nfeXml.ts
git commit -m "feat: quadro Pedido do Vibe preenche a cotação"
```

---

### Task 6: Contrato preenchido pelo pedido e pela nota

**Files:**
- Modify: `src/components/contract/ContractDialog.tsx`, `src/components/contract/DocumentStep.tsx`, `src/components/contract/RecipientStep.tsx`, `src/components/Cotador.tsx`

**Interfaces:**
- Consumes: `VibeSelection`, `LoadedNfe`, `compareNfeWithVibe` (Task 1); `recipientFromNfe`, `vibeOrder` no corpo do carrinho (Task 4); `attachVibeInvoice` (Task 5); `compareNfeWithQuote`.
- Produces:
  - `ContractDialog` com props novas `vibe?: VibeSelection | null` e `onRequoteWithInvoice?: (invoice: LoadedNfe) => void`.
  - `DocumentStep` com props novas `vibe?: VibeOrder` e `onRequote?: (invoice: LoadedNfe) => void`.
  - `RecipientStep`: `prefilledFrom?: string` vira `prefilledNote?: string` (frase pronta).

- [ ] **Step 1: `RecipientStep` com a frase pronta**

Troque a prop e o texto:

```tsx
  /** Where the fields came from, e.g. "Dados preenchidos pela NF-e nº 12345." */
  prefilledNote?: string;
```

```tsx
        {prefilledNote ? (
          <p className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-fg">
            <FileCheck2 className="h-4 w-4 shrink-0" aria-hidden />
            {prefilledNote} Confira e complete o que faltar.
          </p>
        ) : (
```

- [ ] **Step 2: `DocumentStep` conhece o pedido**

Props novas:

```tsx
  /** Vibe order on screen: the invoice is compared with it. */
  vibe?: VibeOrder;
  /** Offered when the invoice's CEP differs from the quote: redo the quote with it. */
  onRequote?: (invoice: LoadedNfe) => void;
```

Em `readXml`, troque a linha do `setLoaded` por:

```tsx
      const checks = compareNfeWithQuote(nfe, { destinationCep, declaredValue });
      // With a different CEP the blocking message already says it; the other differences still matter.
      const vibeWarnings = vibe && !checks.blocking ? compareNfeWithVibe(nfe, vibe) : [];
      setLoaded({ nfe, xml, blocking: checks.blocking, warnings: [...checks.warnings, ...vibeWarnings] });
```

Logo depois do parágrafo de `loaded.blocking`:

```tsx
          {loaded?.blocking && onRequote && (
            <button
              type="button"
              onClick={() => onRequote({ nfe: loaded.nfe, xml: loaded.xml })}
              className="btn-secondary w-full"
            >
              Refazer a cotação com a nota
            </button>
          )}
```

- [ ] **Step 3: `ContractDialog` começa pelo pedido e pela nota**

Props:

```tsx
type Props = {
  option: QuoteOption;
  quote: QuoteRequest;
  vibe?: VibeSelection | null;
  onRequoteWithInvoice?: (invoice: LoadedNfe) => void;
  onClose: () => void;
};
```

Rascunho inicial (substitui o `useState<ContractDraft>({...})` atual):

```tsx
  const declaredValue = quote.volumes.reduce((total, volume) => total + volume.insurance * volume.quantity, 0);
  const [draft, setDraft] = useState<ContractDraft>(() => initialDraft(vibe ?? null, quote.destinationCep, declaredValue));
```

(mova a linha de `declaredValue` para antes do `useState`), com a função fora do componente:

```tsx
/** Starts from the Vibe order: its invoice when attached (the invoice wins), else its recipient. */
function initialDraft(vibe: VibeSelection | null, destinationCep: string, declaredValue: number): ContractDraft {
  const invoice = vibe?.invoice;
  if (vibe && invoice) {
    const checks = compareNfeWithQuote(invoice.nfe, { destinationCep, declaredValue });
    return {
      source: "xml",
      recipient: recipientFromNfe(invoice.nfe.recipient),
      content: { kind: "invoice", key: invoice.nfe.key, xml: invoice.xml },
      nfe: {
        number: invoice.nfe.number,
        totalValue: invoice.nfe.totalValue,
        warnings: [...checks.warnings, ...compareNfeWithVibe(invoice.nfe, vibe.order)],
      },
    };
  }
  return { source: "xml", recipient: vibe?.order.recipient ?? EMPTY_RECIPIENT, content: { kind: "invoice", key: "" } };
}
```

No POST do carrinho, acrescente `vibeOrder: vibe?.order.id` ao `body`.

Na `DocumentStep`:

```tsx
            vibe={vibe?.order}
            onRequote={
              vibe && onRequoteWithInvoice
                ? (invoice) => {
                    discardCart();
                    onRequoteWithInvoice(invoice);
                  }
                : undefined
            }
```

Na `RecipientStep`, troque `prefilledFrom={…}` por:

```tsx
            prefilledNote={
              draft.source === "xml" && draft.nfe
                ? `Dados preenchidos pela NF-e nº ${draft.nfe.number}.`
                : vibe
                  ? `Dados preenchidos pelo pedido ${vibe.order.id} do Vibe.`
                  : undefined
            }
```

Imports novos: `compareNfeWithQuote` (`@/lib/nfeChecks`), `recipientFromNfe` (`@/lib/recipient`), `compareNfeWithVibe, type LoadedNfe, type VibeSelection` (`@/lib/vibe`).

- [ ] **Step 4: `Cotador` repassa o pedido e o "refazer"**

```tsx
        <ContractDialog
          option={contracting}
          quote={quote.request}
          vibe={vibe}
          onRequoteWithInvoice={(invoice) => {
            setContracting(null);
            attachVibeInvoice(invoice);
          }}
          onClose={() => setContracting(null)}
        />
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run`
Expected: sem erros; todos passam.

- [ ] **Step 6: Commit**

```bash
git add src/components
git commit -m "feat: contrato preenchido pelo pedido do Vibe, com a nota prevalecendo"
```

---

### Task 7: Teste no navegador e leitura no Vibe real

**Files:**
- Create (scratchpad, não versionado): `scratchpad/e2e/fake-vibe.mjs`, `scratchpad/e2e/vibe.mjs`

**Interfaces:**
- Consumes: tudo acima; fixture `vibe-pedido.json`; `nfe-ficticia.xml`.
- Produces: evidência de que o fluxo funciona; nenhum arquivo do repositório.

- [ ] **Step 1: Vibe de mentira**

`scratchpad/e2e/fake-vibe.mjs`: servidor `node:http` na porta 4010 que:
- exige `x-api-key: e2e-key` (senão 401 `{erro:"nao_autorizado"}`);
- `GET /pedidos/22773` → a fixture `vibe-pedido.json`;
- `GET /pedidos/22774` → a fixture com `peso_aferido_kg: null`;
- `GET /pedidos/22775` → a fixture com `entrega.endereco.cep = "90010000"` (CEP diferente da nota);
- qualquer outro → 404 `{erro:"nao_encontrado",mensagem:"Pedido não encontrado."}`.

- [ ] **Step 2: Subir o app contra o sandbox e o Vibe de mentira**

Com a porta 3000 livre (confira antes: um processo antigo nela já fez um teste cair na produção):

```bash
MELHOR_ENVIO_ENV=sandbox VIBE_API_URL=http://localhost:4010/pedidos VIBE_API_KEY=e2e-key npm run dev
```

- [ ] **Step 3: Roteiro Playwright (`scratchpad/e2e/vibe.mjs`)**

O script aborta se a faixa "Ambiente de testes" não aparecer. Passos e o que conferir:
1. Login; o quadro "Pedido do Vibe" aparece.
2. Digitar `22774` e **Enter** → mensagem "Esse pedido ainda não foi pesado no despacho."; nenhuma cotação foi feita (Review Focus 5).
3. Digitar `99999` e Buscar → "Pedido não encontrado."
4. Digitar `22773` e Buscar → resumo "Pedido 22773 · CLIENTE FICTÍCIO…"; origem Porto Alegre marcada e desabilitada; CEP `01018-020` só leitura; volume 22 × 32 × 11,88, 4,95 kg, R$ 668,25; resultados aparecem.
5. Anexar `nfe-ficticia.xml` no quadro → "NF-e nº 12345 anexada"; nenhum aviso (mesmo destinatário e CEP).
6. Contratar um serviço dos Correios → etapa Documento com "NF-e nº 12345 já carregada."; Continuar → destinatário "Cliente Ficticio Comercio LTDA", faixa "Dados preenchidos pela NF-e nº 12345."; Revisar envio → "Preço confirmado". Ler no sandbox (`GET /api/v2/me/cart`) as marcações do item: `cotador-fretes` e `Vibe 22773`. Fechar (o item sai do carrinho).
7. Limpar → quadro vazio, origem liberada e de volta à lembrada, CEP editável.
8. Buscar `22775` (CEP 90010-000) → contratar → anexar o XML **dentro** do contrato → mensagem de CEP diferente + botão "Refazer a cotação com a nota" → clicar → contrato fecha, quadro mostra a nota, aviso de CEP diferente do pedido, CEP `01018-020` e nova cotação.
9. Carrinho do sandbox vazio no fim.

Se o sandbox recusar a marcação `Vibe 22773` (espaço ou tamanho), troque para `vibe-22773` no `shipments.ts` e no teste da Task 4, e ajuste o desenho.

- [ ] **Step 4: Leitura no Vibe real**

Com `VIBE_API_URL` e `VIBE_API_KEY` reais no `.env.local`, rodar o `scratchpad/vibe-probe.mjs` (imprime só a forma da resposta, nunca valores) para um pedido real indicado pelo usuário. Conferir que a forma bate com `vibeResponseSchema`. Nada de etiqueta ou pagamento em produção.

- [ ] **Step 5: Encerrar**

Parar o dev server e o Vibe de mentira. `npx vitest run`, `npx tsc --noEmit`, `npx eslint src` uma última vez. Nada a commitar nesta tarefa, salvo ajustes que o teste revelar (cada um com seu teste e commit).

---

## Depois do plano

- O usuário adiciona `VIBE_API_URL` e `VIBE_API_KEY` na Vercel (Production e Preview) antes de publicar.
- Publicar (push para `main`) só com aprovação explícita.
