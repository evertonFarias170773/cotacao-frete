# Contratação do frete com PIX e geração de etiquetas — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A partir de uma cotação na tela, o usuário contrata o serviço escolhido, paga (saldo da carteira ou PIX) e imprime a etiqueta, sem sair do app.

**Architecture:** O navegador continua falando só com rotas internas do Next. As rotas, protegidas por login, montam o item do carrinho do Melhor Envio a partir da cotação e dos dados do destinatário, pagam com o saldo da carteira, recarregando a carteira por PIX quando falta saldo, e depois geram e entregam a etiqueta. O Melhor Envio continua sendo a fonte da verdade dos envios: o app não ganha banco de dados.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), TypeScript, Zod 4, React Hook Form, Tailwind 4, Vitest 5, API REST do Melhor Envio v2.

**Spec:** seções 1 a 3 deste documento (descobertas da API, decisões e fluxo). Não há documento de spec separado.

## Global Constraints

- Todo texto de interface, mensagem de erro e documentação em pt-BR. Identificadores e comentários de código em inglês, como no resto do repositório.
- O token do Melhor Envio é lido só no servidor, em módulos com `import "server-only"`. Nenhuma variável nova usa o prefixo `NEXT_PUBLIC_`.
- Sem banco de dados. Estado de envios vem da API do Melhor Envio. `localStorage` só para conveniências do próprio aparelho.
- Nenhuma rota que gasta dinheiro ou expõe dados pessoais pode ir para a Vercel antes da Fase 1 (login) estar no ar.
- O CEP e os dados do remetente são sempre resolvidos no servidor a partir de `originId`. O cliente nunca envia dados do remetente.
- O repositório no GitHub é público. CNPJ, inscrição estadual, telefone e e-mail do remetente não entram em arquivo versionado enquanto ele for público.
- O valor de qualquer PIX é calculado no servidor a partir do total do carrinho e do saldo. O cliente nunca informa o valor.
- Desenvolvimento das compras contra o sandbox (`MELHOR_ENVIO_ENV=sandbox`). Produção só para o teste de PIX da Fase 0 e para uso real.
- Next 16: o antigo middleware agora é `src/proxy.ts`. O guia oficial avisa que o proxy é só checagem otimista: toda rota de API sensível verifica a sessão de novo.
- Lint do React Compiler ativo (`react-hooks/refs`, `set-state-in-effect`, `purity`). Siga os padrões já usados em [Cotador.tsx](../../../src/components/Cotador.tsx).
- TDD em toda lógica pura, com Vitest em `src/**/*.test.ts`. Commits pequenos, com a linha `Co-Authored-By` definida para a sessão.

## Review Focus

1. **Clique duplo ou nova tentativa em "Pagar".** O usuário espera uma única compra. A segunda chamada tem de reconhecer o pedido já pago (a API responde 422 "One or more orders have already been paid") e seguir para a etiqueta, sem cobrar de novo. Teste na Tarefa 3.3.
2. **Preço do carrinho diferente da cotação.** O carrinho arredonda medidas e pode repricear. O usuário espera ver e confirmar o valor final antes de pagar, e nunca pagar um valor que não viu. Teste na Tarefa 2.4.
3. **PIX pago, mas a aba foi fechada durante a espera.** O usuário espera reabrir o app e concluir a compra com o saldo que entrou, sem pagar outro PIX. Teste na Tarefa 3.4.
4. **Envio com vários volumes pelos Correios, Loggi ou J&T.** A API exige um item de carrinho por volume. Se uma das etiquetas falhar, o usuário espera ver quais saíram e poder tentar só a que faltou. Testes nas Tarefas 2.2 e 4.1.
5. **Transferência entre as próprias unidades (Porto Alegre ↔ Santa Cruz).** Remetente e destinatário com o mesmo CNPJ são recusados por algumas transportadoras (regra `different:from.company_document` da Total Express). O usuário espera uma mensagem clara, não um erro genérico. Teste na Tarefa 2.3.

---

## 1. O que a API permite (descobertas)

Fontes: documentação oficial em `docs.melhorenvio.com.br` e chamadas de leitura feitas em 28/09/2026 com o token de produção atual. Itens marcados **[verificar na Fase 0]** estão na documentação mas não foram exercitados.

### 1.1 Fluxo de compra

```
cotação ─▶ POST /api/v2/me/cart ─▶ POST /api/v2/me/shipment/checkout ─▶ POST /api/v2/me/shipment/generate ─▶ POST /api/v2/me/shipment/print
           (item no carrinho,        (paga com o saldo da carteira)        (transportadora é notificada)       (link do PDF/JPEG/ZPL)
            devolve id e preço)
```

| Etapa | Endpoint | Escopo do token | Observações |
|---|---|---|---|
| Colocar no carrinho | `POST /api/v2/me/cart` | `cart-write` | Exige remetente e destinatário completos, conteúdo (declaração ou NF-e), volumes e opções. Devolve `id` (UUID), `protocol` e `price`. |
| Ver / remover do carrinho | `GET /api/v2/me/cart`, `DELETE /api/v2/me/cart/{id}` | `cart-read`, `cart-write` | Para limpar itens abandonados. |
| Consultar saldo | `GET /api/v2/me/balance` | [verificar na Fase 0] | Rota existe: respondeu 403 com o token atual, não 404. |
| Recarregar carteira com PIX | `POST /api/v2/me/balance` | [verificar na Fase 0] | `{ "gateway": "yapay-transparente", "slug": "pix", "value": "10.50", "redirect_url": "..." }`. A documentação diz que a resposta traz o link do QR Code. O exemplo publicado vem com `"link": null`. |
| Pagar | `POST /api/v2/me/shipment/checkout` | `shipping-checkout` | `{ "orders": ["uuid"] }`. Debita a carteira. Aceita `gateway` e `redirect` para pagar por link externo [verificar na Fase 0]. |
| Gerar etiqueta | `POST /api/v2/me/shipment/generate` | `shipping-generate` | Resposta por pedido: `{ "<uuid>": { "status": true, "message": "Envio gerado com sucesso" } }`. Etiqueta imprimível por 20 dias. |
| Imprimir | `POST /api/v2/me/shipment/print` | `shipping-print` | `{ "mode": "private" \| "public", "orders": [...] }` devolve `{ "url": "..." }`. Existe também a variante "em arquivo" [verificar na Fase 0]. |
| Listar envios | `GET /api/v2/me/orders?status=...&page=...` | `orders-read` | Paginado, 10 por página. Substitui um banco de dados próprio. |
| Cancelar | `POST /api/v2/me/shipment/cancel` | `shipping-cancel` | `{ "order": { "id", "reason_id": "2", "description" } }`. Estorno para a carteira em até 12 h. Não cancela depois de postado. |
| Agências | `GET /api/v2/me/shipment/agencies?company=&state=&city=` | nenhum | Funcionou sem token: 63 agências Jadlog em Porto Alegre. |

### 1.2 O PIX

**O PIX do Melhor Envio não paga a etiqueta diretamente. Ele recarrega a carteira, e a etiqueta é paga com o saldo.** Consequências para o produto:

- Se já houver saldo suficiente, a compra é imediata e não precisa de PIX.
- Se faltar saldo, o app gera um PIX da diferença, espera a confirmação e então paga a etiqueta.
- Os webhooks do Melhor Envio só avisam eventos de etiqueta (`order.created`, `order.released`, `order.generated`, `order.posted`, `order.delivered`, `order.cancelled` e outros). Não existe evento de pagamento de recarga. A confirmação do PIX terá de ser por consulta periódica.
- **O sandbox não tem PIX.** Lá só existe o gateway Yapay, aprovado automaticamente após 5 minutos. O formato real da resposta do PIX só pode ser conhecido em produção, com uma recarga pequena.

### 1.3 O que cada transportadora exige

Lista de serviços da sua conta (`GET /api/v2/me/shipment/services`), consultada em 28/09/2026:

| Serviço | Exige nota fiscal | Exige agência | Aceita vários volumes num item |
|---|---|---|---|
| Correios PAC, SEDEX, Mini Envios | não | não | não, um item por volume |
| Loggi Express, Coleta, Ponto | não | não | não, um item por volume |
| J&T Standard | não | não | não, um item por volume |
| Jadlog .Package, .Com, .Package Centralizado | sim | não informado | sim |
| LATAM Cargo éFácil | sim, e CNAE do remetente | sim, com token do painel | sim |
| Azul Cargo Expresso, e-commerce | sim | sim, com token do painel | sim |
| Buslog Rodoviário | sim | sim, com token do painel | sim |
| Total Express Standard | só se o envio for comercial | sim (`options.agency_id`) | sim |

Sem nota fiscal (declaração de conteúdo), o app fica restrito a Correios, Loggi, J&T e Total Express. Isso será confirmado no sandbox com a Jadlog, que é uma das duas transportadoras disponíveis lá.

Outras regras do carrinho:

- Pessoa física manda `document` (CPF). Pessoa jurídica manda `company_document` (CNPJ), com `state_register` e, para a LATAM, `economic_activity_code`.
- Envio comercial: `options.invoice.key` com a chave da NF-e e `from.state_register` preenchido. Envio não comercial: `non_commercial: true` e `from.state_register` vazio ou `ISENTO`.
- Desde 06/04/2026 existe o campo `options.dce.key`, obrigatório apenas quando a Declaração de Conteúdo eletrônica é emitida fora do Melhor Envio [verificar na Fase 0].
- No carrinho, altura, largura e comprimento são inteiros. O pacote de 18 Triband tem 21,6 cm de altura. O app arredonda para cima (22 cm), nunca para baixo.

### 1.4 Token e ambiente

O token atual tem apenas os escopos `shipping-calculate` e `shipping-generate`. Com ele, conta, saldo, carrinho e listagem de envios respondem **403 "This action is unauthorized."** É preciso gerar um token novo no painel com:

```
shipping-calculate cart-read cart-write shipping-checkout shipping-generate shipping-print
shipping-preview shipping-tracking shipping-cancel orders-read purchases-read
transactions-read users-read
```

O sandbox (`sandbox.melhorenvio.com.br`) exige cadastro e token próprios, tem R$ 10.000,00 de saldo fictício, só simula Correios e Jadlog, e muda o status dos envios sozinho 15 minutos após a criação.

---

## 2. Decisões que dependem de você

Cada uma muda o que será construído. Há uma recomendação em cada.

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | Quem usa a contratação e de quem é o dinheiro? | A equipe interna, pagando com a carteira do Melhor Envio da empresa. Se a ideia for o **cliente final** pagar à empresa, é outro projeto: exige um provedor de PIX próprio (Mercado Pago, Efí etc.) e não é coberto aqui. |
| D2 | Como pagar quando já existe saldo? | Usar o saldo primeiro e gerar PIX só da diferença. A alternativa é sempre gerar PIX do valor cheio, o que acumula saldo parado. |
| D3 | Os envios saem com nota fiscal (NF-e)? | Se sim, o formulário pede a chave de 44 dígitos e todas as transportadoras ficam disponíveis. Se não, o envio vai com declaração de conteúdo e a lista de contratação mostra só Correios, Loggi, J&T e Total Express. Pode ser "depende do envio": o app oferece as duas opções. |
| D4 | Dados completos dos dois remetentes | Preciso de razão social, CNPJ, inscrição estadual, CNAE, telefone, e-mail e endereço completo das unidades de Porto Alegre e Santa Cruz do Sul. |
| D5 | Agência de postagem (Jadlog, LATAM, Azul, Buslog, Total) | Uma agência fixa por unidade e transportadora, configurada no código. Escolher agência a cada envio fica para depois, se for necessário. |
| D6 | Como proteger o app, que hoje é público na Vercel | Senha única compartilhada pela equipe, com sessão assinada em cookie. Não precisa de banco. A alternativa é login Google restrito ao domínio da empresa, se vocês usam Google Workspace. |

Ações que só você pode fazer:

1. Gerar o token de produção novo com os escopos da seção 1.4.
2. Criar a conta de sandbox e gerar o token de sandbox.
3. Autorizar uma recarga PIX real de R$ 1,00 para o teste da Fase 0.

---

## 3. Fluxo proposto para o usuário

1. Na lista de resultados, cada opção ganha o botão **Contratar**. Opções que a configuração da empresa não permite contratar (por exemplo, exigem NF-e e o envio é por declaração) aparecem sem o botão, com o motivo.
2. Abre a tela **Contratar envio**, em etapas, sobre a cotação:
   1. **Destinatário.** Nome, CPF ou CNPJ, telefone, e-mail opcional. O endereço vem preenchido pelo ViaCEP a partir do CEP já cotado, e o usuário completa número e complemento. O CEP não é editável: trocar o CEP exige nova cotação.
   2. **Conteúdo.** Declaração de conteúdo (descrição, com "Triband" já preenchido quando o atalho foi usado) ou chave da NF-e, conforme a decisão D3.
   3. **Revisão.** O app coloca o envio no carrinho do Melhor Envio e mostra o **preço confirmado pelo carrinho**, o serviço, o prazo, os volumes e o destinatário. Se o preço mudou em relação à cotação, a diferença aparece destacada.
   4. **Pagamento.** Mostra o saldo da carteira. Com saldo suficiente: botão **Pagar com saldo**. Sem saldo: botão **Gerar PIX de R$ X**, com o QR Code, o copia-e-cola e o aviso "aguardando pagamento". Quando o saldo entra, a compra é concluída sozinha.
   5. **Etiqueta.** Gera a etiqueta e mostra **Imprimir etiqueta** e o código de rastreio. Com vários volumes pelos Correios, uma etiqueta por volume, com o resultado de cada uma.
3. Nova tela **Envios**, que lista os envios da conta direto do Melhor Envio: status, rastreio, reimprimir e cancelar. É também por ela que se retoma uma compra interrompida.
4. Sair da tela de contratação antes de pagar remove o item do carrinho do Melhor Envio.

---

## 4. Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/proxy.ts` | Redireciona para `/entrar` quem não tem sessão. Checagem otimista apenas. |
| `src/app/entrar/page.tsx`, `src/app/api/session/route.ts` | Tela de login e criação/encerramento da sessão. |
| `src/lib/session.ts` | Assinar e verificar o cookie de sessão (HMAC-SHA256, Web Crypto). Lógica pura. |
| `src/lib/requireSession.ts` | Verificação de sessão reutilizada por toda rota sensível (server-only). |
| `src/config/senders.ts` | Dados completos dos remetentes e agência preferida por transportadora (decisões D4 e D5). |
| `src/lib/documents.ts` | Validação de CPF e CNPJ, inclusive o CNPJ alfanumérico. Lógica pura. |
| `src/lib/nfe.ts` | Validação da chave de NF-e de 44 dígitos. Lógica pura. |
| `src/lib/recipient.ts` | Schema Zod do destinatário e do conteúdo. |
| `src/lib/cart.ts` | Monta os itens do carrinho a partir da cotação. Lógica pura, coração do plano. |
| `src/lib/wallet.ts` | Calcula o valor do PIX a partir do total e do saldo. Lógica pura. |
| `src/lib/melhorEnvio.ts` | Cliente da API (existente). Ganha um `meRequest` genérico para as novas rotas. |
| `src/lib/shipments.ts` | Operações server-only: carrinho, saldo, PIX, checkout, geração, impressão, listagem, cancelamento. |
| `src/app/api/shipments/**/route.ts` | Rotas internas, uma por operação, todas com `requireSession`. |
| `src/components/contract/*` | Etapas da tela Contratar envio. |
| `src/app/envios/page.tsx`, `src/components/ShipmentsList.tsx` | Tela Envios. |

---

## 5. Fases e tarefas

Cada fase termina com software funcionando e testável. **As Fases 0 e 1 não dependem das decisões D2 a D5.** As tarefas que conversam com a API ficam com o código detalhado depois da Fase 0, porque o formato real das respostas (principalmente do PIX) vai virar fixture de teste. Isso está marcado em cada uma como "detalhar após a Fase 0", e é um portão consciente, não uma lacuna.

### Fase 0 — Preparação e prova de conceito

#### Task 1 (Tarefa 0.1): Credenciais e decisões

- [ ] **Passo 1:** Você gera o token de produção com os escopos da seção 1.4 e o token de sandbox.
- [ ] **Passo 2:** Os tokens vão para `.env.local` como `MELHOR_ENVIO_TOKEN` (produção) e `MELHOR_ENVIO_SANDBOX_TOKEN` (usado só pelos scripts da Tarefa 0.2).
- [ ] **Passo 3:** Registrar as respostas de D1 a D6 no fim deste documento.

#### Task 2 (Tarefa 0.2): Script de ponta a ponta no sandbox

**Files:**
- Create: `scripts/spike-sandbox.mjs` (fora do bundle, não vai para produção)
- Create: `src/lib/__fixtures__/me-*.json` (respostas reais, com dados pessoais trocados por fictícios)

- [ ] **Passo 1:** Com o token de sandbox, o script executa: cotação → carrinho (Correios PAC, 2 volumes em 2 itens) → saldo → checkout → geração → impressão → listagem → cancelamento de um dos dois.
- [ ] **Passo 2:** Repetir com Jadlog `.Package` e `non_commercial: true`, para confirmar se a Jadlog aceita declaração de conteúdo (seção 1.3).
- [ ] **Passo 3:** Testar `POST /shipment/print` nos modos `private` e `public` e a variante "em arquivo". Registrar se o PDF pode ser baixado pelo servidor com o token. Isso decide a Tarefa 4.2.
- [ ] **Passo 4:** Registrar quais escopos cada chamada exigiu e salvar cada resposta como fixture.

```bash
node scripts/spike-sandbox.mjs
```

Resultado esperado: um relatório no terminal com status HTTP e campos-chave de cada etapa, e os arquivos de fixture gravados.

#### Task 3 (Tarefa 0.3): Teste real do PIX em produção

- [ ] **Passo 1:** Com a sua autorização, `POST /api/v2/me/balance` de R$ 1,00 com `slug: "pix"`. Registrar a resposta completa: existe link do QR Code? Existe código copia-e-cola? Em quanto tempo expira?
- [ ] **Passo 2:** Pagar o PIX e descobrir como consultar a confirmação: `GET /api/v2/me/balance`, listagem de transações ou pagamento por id. Medir o tempo até o saldo aparecer.
- [ ] **Passo 3:** Testar se `POST /shipment/checkout` com `gateway` e `redirect` gera cobrança PIX direta para o pedido. Se gerar, o fluxo da Fase 3 fica mais simples.
- [ ] **Passo 4:** Salvar a resposta como fixture e atualizar a seção 1.2 com o que foi confirmado.

### Fase 1 — Acesso protegido

**Entrega:** o app inteiro exige senha. Quem não entrou vê só a tela de login. Esta fase vai para a Vercel antes de qualquer rota de compra.

#### Task 4 (Tarefa 1.1): Sessão assinada

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Produces: `createSession(secret: string, now?: number, ttlMs?: number): Promise<string>`, `verifySession(token: string | undefined, secret: string, now?: number): Promise<boolean>`, `passwordMatches(input: string, expected: string): boolean`, `SESSION_COOKIE = "cotador_session"`, `SESSION_TTL_MS = 12 * 60 * 60 * 1000`.

- [ ] **Passo 1: Escrever os testes que falham**

```ts
import { describe, expect, test } from "vitest";
import { createSession, passwordMatches, verifySession } from "./session";

const SECRET = "s".repeat(32);

describe("session", () => {
  test("accepts a fresh session signed with the same secret", async () => {
    const token = await createSession(SECRET, 1_000, 60_000);
    expect(await verifySession(token, SECRET, 2_000)).toBe(true);
  });

  test("rejects an expired session", async () => {
    const token = await createSession(SECRET, 1_000, 60_000);
    expect(await verifySession(token, SECRET, 61_001)).toBe(false);
  });

  test("rejects a session whose expiry was tampered with", async () => {
    const token = await createSession(SECRET, 1_000, 60_000);
    const [, signature] = token.split(".");
    expect(await verifySession(`99999999999999.${signature}`, SECRET, 2_000)).toBe(false);
  });

  test("rejects a session signed with another secret", async () => {
    const token = await createSession("x".repeat(32), 1_000, 60_000);
    expect(await verifySession(token, SECRET, 2_000)).toBe(false);
  });

  test("rejects missing and malformed cookies", async () => {
    expect(await verifySession(undefined, SECRET)).toBe(false);
    expect(await verifySession("", SECRET)).toBe(false);
    expect(await verifySession("abc", SECRET)).toBe(false);
    expect(await verifySession("abc.def", SECRET)).toBe(false);
  });
});

describe("passwordMatches", () => {
  test("compares the whole password", () => {
    expect(passwordMatches("segredo-longo", "segredo-longo")).toBe(true);
    expect(passwordMatches("segredo-long", "segredo-longo")).toBe(false);
    expect(passwordMatches("", "segredo-longo")).toBe(false);
  });

  test("never matches when no password is configured", () => {
    expect(passwordMatches("", "")).toBe(false);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/session.test.ts`
Expected: FAIL com "Cannot find module './session'".

- [ ] **Passo 3: Implementar**

```ts
/** Signed session cookie: "<expiresAtMs>.<base64url HMAC-SHA256>". Web Crypto only, so it runs in the proxy too. */
export const SESSION_COOKIE = "cotador_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(secret: string, now = Date.now(), ttlMs = SESSION_TTL_MS): Promise<string> {
  const expiresAt = String(now + ttlMs);
  return `${expiresAt}.${await sign(secret, expiresAt)}`;
}

export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (!constantTimeEqual(await sign(secret, expiresAt), signature)) return false;
  return Number(expiresAt) > now;
}

export function passwordMatches(input: string, expected: string): boolean {
  if (!expected) return false;
  return constantTimeEqual(input, expected);
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx vitest run src/lib/session.test.ts`
Expected: PASS, 7 testes.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts
git commit -m "feat: sessão assinada para proteger o app"
```

#### Task 5 (Tarefa 1.2): Login, proxy e proteção das rotas

**Files:**
- Create: `src/lib/requireSession.ts`, `src/proxy.ts`, `src/app/entrar/page.tsx`, `src/app/api/session/route.ts`
- Modify: `src/app/api/quote/route.ts` (passa a exigir sessão), `.env.example`, `README.md`
- Test: `src/lib/requireSession.test.ts`

**Interfaces:**
- Consumes: `createSession`, `verifySession`, `passwordMatches`, `SESSION_COOKIE` da Tarefa 1.1.
- Produces: `requireSession(request: Request): Promise<Response | null>`, que devolve uma resposta 401 quando não há sessão válida e `null` quando está tudo certo. Toda rota nova começa com `const denied = await requireSession(request); if (denied) return denied;`.

Novas variáveis de ambiente, só no servidor: `APP_PASSWORD` e `SESSION_SECRET` (mínimo 32 caracteres). Sem `SESSION_SECRET`, o app nega tudo em vez de aceitar tudo.

- [ ] **Passo 1: Testes que falham** para `requireSession`: sem cookie devolve 401 com `{ "error": "Entre com a senha para continuar." }`; cookie válido devolve `null`; `SESSION_SECRET` ausente ou curto devolve 500 e nunca `null`.
- [ ] **Passo 2:** Rodar `npx vitest run src/lib/requireSession.test.ts` e ver falhar.
- [ ] **Passo 3:** Implementar `requireSession` lendo o cabeçalho `cookie` da requisição.
- [ ] **Passo 4:** `src/proxy.ts` com `export async function proxy(request)` que redireciona para `/entrar?para=<caminho>` quando `verifySession` falha. O `matcher` exclui `/entrar`, `/api/session`, `/_next/static`, `/_next/image`, `/icons`, `/manifest.webmanifest`, `/sw.js`, `/favicon.ico`, `/icon.png` e `/apple-icon.png`, para o PWA continuar instalável.
- [ ] **Passo 5:** `POST /api/session` compara a senha com `passwordMatches`, espera 500 ms quando erra e grava o cookie `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`. `DELETE /api/session` apaga o cookie. A página `/entrar` tem um campo de senha e o botão Entrar, no mesmo visual do app.
- [ ] **Passo 6:** `/api/quote` passa a chamar `requireSession`. O service worker já não cacheia `/api/*`, então nada muda nele.
- [ ] **Passo 7:** Verificar no navegador: sem login, `/` redireciona para `/entrar`; com senha errada, mensagem "Senha incorreta."; com senha certa, volta para a página pedida; `/api/quote` sem cookie responde 401.
- [ ] **Passo 8:** Rodar `npm test`, `npm run typecheck`, `npm run lint` e commitar.

### Fase 2 — Dados do envio e carrinho

**Entrega:** o botão Contratar abre a tela, o usuário preenche destinatário e conteúdo, e vê o preço confirmado pelo carrinho do Melhor Envio (sandbox). Ainda não paga.

#### Task 6 (Tarefa 2.1): Validação de documentos

**Files:**
- Create: `src/lib/documents.ts`, `src/lib/nfe.ts`
- Test: `src/lib/documents.test.ts`, `src/lib/nfe.test.ts`

**Interfaces:**
- Produces: `normalizeDocument(value: string): string`, `isValidCpf(value: string): boolean`, `isValidCnpj(value: string): boolean`, `documentKind(value: string): "cpf" | "cnpj" | null`, `isValidNfeKey(value: string): boolean`.

- [ ] **Passo 1: Testes que falham**

```ts
import { describe, expect, test } from "vitest";
import { documentKind, isValidCnpj, isValidCpf } from "./documents";

describe("isValidCpf", () => {
  test("accepts a valid CPF with or without mask", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });
  test("rejects wrong check digits, repeated digits and wrong length", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
  });
});

describe("isValidCnpj", () => {
  test("accepts a valid numeric CNPJ", () => {
    expect(isValidCnpj("46.867.029/0001-76")).toBe(true);
  });
  test("accepts the alphanumeric CNPJ issued since July 2026", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
  });
  test("rejects wrong check digits and repeated digits", () => {
    expect(isValidCnpj("46.867.029/0001-77")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});

describe("documentKind", () => {
  test("tells CPF from CNPJ and rejects invalid ones", () => {
    expect(documentKind("529.982.247-25")).toBe("cpf");
    expect(documentKind("46.867.029/0001-76")).toBe("cnpj");
    expect(documentKind("123")).toBeNull();
  });
});
```

```ts
import { describe, expect, test } from "vitest";
import { isValidNfeKey } from "./nfe";

describe("isValidNfeKey", () => {
  test("accepts 44 digits with the right check digit, masked or not", () => {
    expect(isValidNfeKey("1".repeat(43) + "2")).toBe(true);
    expect(isValidNfeKey(("1".repeat(43) + "2").replace(/(\d{4})/g, "$1 "))).toBe(true);
  });
  test("rejects a wrong check digit and wrong lengths", () => {
    expect(isValidNfeKey("1".repeat(43) + "3")).toBe(false);
    expect(isValidNfeKey("1".repeat(43))).toBe(false);
  });
});
```

- [ ] **Passo 2:** Rodar `npx vitest run src/lib/documents.test.ts src/lib/nfe.test.ts` e ver falhar por módulo inexistente.
- [ ] **Passo 3: Implementar**

```ts
/** CPF and CNPJ check digits, including the alphanumeric CNPJ (Receita Federal, from July 2026). */

export function normalizeDocument(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeDocument(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = [...cpf].map(Number);
  const check = (length: number) => {
    const sum = digits.slice(0, length).reduce((acc, digit, i) => acc + digit * (length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === digits[9] && check(10) === digits[10];
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  // Each character is worth its ASCII code minus 48: digits keep their value, "A" is 17.
  const values = [...cnpj].map((char) => char.charCodeAt(0) - 48);
  const check = (length: number) => {
    let weight = 2;
    let sum = 0;
    for (let i = length - 1; i >= 0; i--) {
      sum += values[i] * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === values[12] && check(13) === values[13];
}

export function documentKind(value: string): "cpf" | "cnpj" | null {
  if (isValidCpf(value)) return "cpf";
  if (isValidCnpj(value)) return "cnpj";
  return null;
}
```

```ts
/** NF-e access key: 44 digits, the last one a mod-11 check digit over the first 43. */
export function isValidNfeKey(value: string): boolean {
  const key = value.replace(/\D/g, "");
  if (key.length !== 44) return false;
  let weight = 2;
  let sum = 0;
  for (let i = 42; i >= 0; i--) {
    sum += Number(key[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return (rest < 2 ? 0 : 11 - rest) === Number(key[43]);
}
```

- [ ] **Passo 4:** Rodar os testes e ver passar.
- [ ] **Passo 5:** Commit `feat: validação de CPF, CNPJ (inclusive alfanumérico) e chave de NF-e`.

#### Task 7 (Tarefa 2.2): Montagem dos itens do carrinho

**Files:**
- Create: `src/lib/cart.ts`
- Modify: `src/lib/payload.ts` (exporta `expandVolumes`, já existente, sem mudança de comportamento)
- Test: `src/lib/cart.test.ts`

**Interfaces:**
- Consumes: `QuoteRequest` e `expandVolumes` existentes.
- Produces: tipos `Party`, `ShipmentContent`, `CartItemPayload`; constante `SINGLE_VOLUME_SERVICES`; função `buildCartItems(input: BuildCartInput): CartItemPayload[]`, que lança `CartBuildError` com mensagem em pt-BR quando os dados são incoerentes.

- [ ] **Passo 1: Testes que falham**

```ts
import { describe, expect, test } from "vitest";
import { CartBuildError, buildCartItems, type Party } from "./cart";
import type { QuoteRequest } from "./schemas";

const sender: Party = {
  name: "Empresa Remetente LTDA",
  phone: "(51) 3333-4444",
  email: "expedicao@empresa.com.br",
  companyDocument: "46.867.029/0001-76",
  stateRegister: "1234567890",
  economicActivityCode: "4687701",
  address: "Rua do Remetente",
  number: "100",
  district: "Centro",
  city: "Porto Alegre",
  postalCode: "90660-130",
  stateAbbr: "RS",
};

const recipient: Party = {
  name: "Cliente Destino",
  phone: "(11) 91234-5678",
  document: "529.982.247-25",
  address: "Rua Anita Garibaldi",
  number: "25",
  complement: "sala 2",
  district: "Sé",
  city: "São Paulo",
  postalCode: "01018-020",
  stateAbbr: "SP",
};

// 18 Triband: one form card, quantity 2.
const request: QuoteRequest = {
  originId: "poa",
  destinationCep: "01018020",
  volumes: [{ height: 21.6, width: 22, length: 32, weight: 9.45, insurance: 1215, quantity: 2 }],
  options: { receipt: false, own_hand: false },
};

const declaration = { kind: "declaration", description: "Triband" } as const;

describe("buildCartItems", () => {
  test("Correios gets one cart item per physical volume", () => {
    const items = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "cotador" });
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.volumes).toHaveLength(1);
      expect(item.options.insurance_value).toBe(1215);
      expect(item.products).toEqual([{ name: "Triband", quantity: "1", unitary_value: "1215.00" }]);
    }
  });

  test("Jadlog keeps all volumes in a single item", () => {
    const content = { kind: "invoice", key: "1".repeat(43) + "2" } as const;
    const items = buildCartItems({ request, serviceId: 3, sender, recipient, content, tag: "cotador" });
    expect(items).toHaveLength(1);
    expect(items[0].volumes).toHaveLength(2);
    expect(items[0].options.insurance_value).toBe(2430);
  });

  test("rounds dimensions up to whole centimetres, never down", () => {
    const [item] = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "cotador" });
    expect(item.volumes[0]).toEqual({ height: 22, width: 22, length: 32, weight: 9.45 });
  });

  test("a content declaration is non-commercial and has no invoice", () => {
    const [item] = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "cotador" });
    expect(item.options.non_commercial).toBe(true);
    expect(item.options.invoice).toBeUndefined();
    expect(item.from.state_register).toBe("");
  });

  test("an invoice makes the shipment commercial and sends the sender's state registration", () => {
    const content = { kind: "invoice", key: "1".repeat(43) + "2" } as const;
    const [item] = buildCartItems({ request, serviceId: 3, sender, recipient, content, tag: "cotador" });
    expect(item.options.non_commercial).toBe(false);
    expect(item.options.invoice).toEqual({ key: "1".repeat(43) + "2" });
    expect(item.from.state_register).toBe("1234567890");
  });

  test("sends digits only for documents, phones and CEPs, and the right document field", () => {
    const [item] = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "cotador" });
    expect(item.from).toMatchObject({ company_document: "46867029000176", phone: "5133334444", postal_code: "90660130", country_id: "BR" });
    expect(item.to).toMatchObject({ document: "52998224725", phone: "11912345678", postal_code: "01018020" });
    expect(item.to.company_document).toBeUndefined();
  });

  test("forwards the additional services and tags the order", () => {
    const withOptions = { ...request, options: { receipt: true, own_hand: true } };
    const [item] = buildCartItems({ request: withOptions, serviceId: 1, sender, recipient, content: declaration, tag: "cotador-123" });
    expect(item.options).toMatchObject({ receipt: true, own_hand: true, reverse: false });
    expect(item.options.tags).toEqual([{ tag: "cotador-123", url: null }]);
  });

  test("includes the agency only when one is given", () => {
    const [without] = buildCartItems({ request, serviceId: 1, sender, recipient, content: declaration, tag: "t" });
    expect("agency" in without).toBe(false);
    const content = { kind: "invoice", key: "1".repeat(43) + "2" } as const;
    const [withAgency] = buildCartItems({ request, serviceId: 3, sender, recipient, content, agencyId: 45696, tag: "t" });
    expect(withAgency.agency).toBe(45696);
  });

  test("refuses a recipient whose CEP is not the quoted destination", () => {
    const elsewhere = { ...recipient, postalCode: "90010-000" };
    expect(() =>
      buildCartItems({ request, serviceId: 1, sender, recipient: elsewhere, content: declaration, tag: "t" }),
    ).toThrow(CartBuildError);
  });
});
```

- [ ] **Passo 2:** Rodar `npx vitest run src/lib/cart.test.ts` e ver falhar por módulo inexistente.
- [ ] **Passo 3: Implementar**

```ts
import { expandVolumes } from "./payload";
import type { QuoteRequest } from "./schemas";

/** Services that reject more than one volume per cart item (account service list, Sept 2026). */
export const SINGLE_VOLUME_SERVICES: ReadonlySet<number> = new Set([1, 2, 17, 31, 32, 33, 34]);

export type Party = {
  name: string;
  phone: string;
  email?: string;
  /** CPF, for people. */
  document?: string;
  /** CNPJ, for companies. */
  companyDocument?: string;
  stateRegister?: string;
  economicActivityCode?: string;
  address: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  postalCode: string;
  stateAbbr: string;
};

export type ShipmentContent =
  | { kind: "declaration"; description: string }
  | { kind: "invoice"; key: string };

type ApiParty = {
  name: string;
  phone: string;
  email?: string;
  document?: string;
  company_document?: string;
  state_register?: string;
  economic_activity_code?: string;
  address: string;
  complement?: string;
  number: string;
  district: string;
  city: string;
  postal_code: string;
  country_id: "BR";
  state_abbr: string;
};

export type CartItemPayload = {
  service: number;
  agency?: number;
  from: ApiParty;
  to: ApiParty;
  products: { name: string; quantity: string; unitary_value: string }[];
  volumes: { height: number; width: number; length: number; weight: number }[];
  options: {
    insurance_value: number;
    receipt: boolean;
    own_hand: boolean;
    reverse: false;
    non_commercial: boolean;
    platform: string;
    invoice?: { key: string };
    tags: { tag: string; url: null }[];
  };
};

export type BuildCartInput = {
  request: QuoteRequest;
  serviceId: number;
  sender: Party;
  recipient: Party;
  content: ShipmentContent;
  agencyId?: number;
  /** Our own reference, visible in the Melhor Envio panel. */
  tag: string;
};

export class CartBuildError extends Error {}

const digits = (value: string) => value.replace(/\D/g, "");
const round2 = (value: number) => Math.round(value * 100) / 100;

function toApiParty(party: Party, stateRegister: string | undefined): ApiParty {
  const api: ApiParty = {
    name: party.name.trim(),
    phone: digits(party.phone),
    address: party.address.trim(),
    number: party.number.trim(),
    district: party.district.trim(),
    city: party.city.trim(),
    postal_code: digits(party.postalCode),
    country_id: "BR",
    state_abbr: party.stateAbbr.toUpperCase(),
  };
  if (party.email) api.email = party.email.trim();
  if (party.complement) api.complement = party.complement.trim();
  if (party.document) api.document = digits(party.document);
  if (party.companyDocument) api.company_document = party.companyDocument.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (stateRegister !== undefined) api.state_register = stateRegister;
  if (party.economicActivityCode) api.economic_activity_code = digits(party.economicActivityCode);
  return api;
}

/** Turns an accepted quote into Melhor Envio cart items, splitting per volume where the carrier demands it. */
export function buildCartItems(input: BuildCartInput): CartItemPayload[] {
  const { request, serviceId, sender, recipient, content, agencyId, tag } = input;
  if (digits(recipient.postalCode) !== request.destinationCep) {
    throw new CartBuildError("O CEP do destinatário é diferente do CEP cotado. Faça uma nova cotação.");
  }

  const commercial = content.kind === "invoice";
  const from = toApiParty(sender, commercial ? (sender.stateRegister ?? "") : "");
  const to = toApiParty(recipient, undefined);
  const physical = expandVolumes(request.volumes);
  const groups = SINGLE_VOLUME_SERVICES.has(serviceId) ? physical.map((volume) => [volume]) : [physical];

  return groups.map((volumes) => {
    const insurance = round2(volumes.reduce((total, volume) => total + volume.insurance, 0));
    const item: CartItemPayload = {
      service: serviceId,
      from,
      to,
      products: volumes.map((volume) => ({
        name: content.kind === "declaration" ? content.description.trim() : "Mercadoria",
        quantity: "1",
        unitary_value: volume.insurance.toFixed(2),
      })),
      volumes: volumes.map((volume) => ({
        height: Math.ceil(volume.height),
        width: Math.ceil(volume.width),
        length: Math.ceil(volume.length),
        weight: volume.weight,
      })),
      options: {
        insurance_value: insurance,
        receipt: request.options.receipt,
        own_hand: request.options.own_hand,
        reverse: false,
        non_commercial: !commercial,
        platform: "Cotador de Fretes",
        tags: [{ tag, url: null }],
      },
    };
    if (commercial) item.options.invoice = { key: digits(content.key) };
    if (agencyId !== undefined) item.agency = agencyId;
    return item;
  });
}
```

- [ ] **Passo 4:** Rodar os testes e ver passar. Rodar a suíte inteira para garantir que `payload.ts` não mudou de comportamento.
- [ ] **Passo 5:** Commit `feat: monta itens do carrinho do Melhor Envio a partir da cotação`.

#### Task 8 (Tarefa 2.3): Remetentes e schema do destinatário

**Files:**
- Create: `src/config/senders.ts` (com os dados da decisão D4 e as agências da D5), `src/lib/recipient.ts`
- Test: `src/config/senders.test.ts`, `src/lib/recipient.test.ts`

**Interfaces:**
- Consumes: `Party`, `ShipmentContent` (Tarefa 2.2); `isValidCpf`, `isValidCnpj`, `isValidNfeKey` (Tarefa 2.1); `OriginId` existente.
- Produces: `getSender(id: OriginId): Party`, `preferredAgency(id: OriginId, companyId: number): number | undefined`, `recipientSchema`, `contentSchema`, `contractRequestSchema` (cotação + `serviceId` + destinatário + conteúdo).

Casos de teste obrigatórios:

- `senders.test.ts`: cada origem tem CNPJ válido, CEP igual ao de [origins.ts](../../../src/config/origins.ts) e todos os campos obrigatórios da seção 1.3.
- `recipient.test.ts`: aceita CPF e CNPJ (numérico e alfanumérico) e preenche `document` ou `companyDocument` conforme o tipo; recusa documento inválido com "CPF ou CNPJ inválido."; exige número do endereço; telefone com 10 ou 11 dígitos; e-mail opcional mas válido quando informado; conteúdo por NF-e recusa chave inválida com "Chave da NF-e inválida.".
- Review Focus 5: destinatário com o mesmo CNPJ do remetente gera a mensagem "Remetente e destinatário têm o mesmo CNPJ. Algumas transportadoras não aceitam transferência entre unidades." e o serviço 35 (Total Express) é marcado como não contratável nesse caso.

Código detalhado desta tarefa depois da decisão D4, porque o formato dos dados das unidades vem dela.

#### Task 9 (Tarefa 2.4): Rota do carrinho e tela de contratação até a revisão

**Files:**
- Modify: `src/lib/melhorEnvio.ts` (extrai `meRequest(method, path, body?)` reaproveitando timeout, cabeçalhos e mapeamento de erros atuais)
- Create: `src/lib/shipments.ts`, `src/app/api/shipments/cart/route.ts`, `src/components/contract/ContractDialog.tsx`, `RecipientStep.tsx`, `ContentStep.tsx`, `ReviewStep.tsx`
- Modify: `src/components/ResultItem.tsx` (botão Contratar), `src/components/Cotador.tsx`
- Test: `src/lib/shipments.test.ts` com as fixtures da Fase 0

**Interfaces:**
- Produces: `POST /api/shipments/cart` recebe `contractRequestSchema` e devolve `{ orders: { id: string; protocol: string; price: number }[]; total: number }`. `DELETE /api/shipments/cart` com `{ orders: string[] }` remove itens.

Casos de teste obrigatórios, com `fetch` simulado:

- Monta o carrinho com o remetente vindo de `originId`, mesmo que o corpo da requisição traga campos de remetente (que são ignorados).
- Com Correios e 2 volumes, faz duas chamadas `POST /cart` e soma os preços.
- Se a segunda chamada falhar, remove a primeira do carrinho e devolve o erro. Nada fica pendurado.
- Review Focus 2: a resposta traz `total` do carrinho, e a tela de revisão mostra "O preço mudou de R$ X para R$ Y" quando difere da cotação em mais de R$ 0,01.

Código detalhado desta tarefa depois da Fase 0.

### Fase 3 — Pagamento

**Entrega:** o usuário paga com saldo ou com PIX e o pedido fica pago no Melhor Envio.

#### Task 10 (Tarefa 3.1): Valor do PIX

**Files:**
- Create: `src/lib/wallet.ts`
- Test: `src/lib/wallet.test.ts`

**Interfaces:**
- Produces: `pixTopUpFor(total: number, balance: number, minimum?: number): number` (0 quando o saldo basta).

- [ ] **Passo 1: Testes que falham**

```ts
import { describe, expect, test } from "vitest";
import { pixTopUpFor } from "./wallet";

describe("pixTopUpFor", () => {
  test("no PIX when the balance covers the order", () => {
    expect(pixTopUpFor(74.95, 100)).toBe(0);
    expect(pixTopUpFor(74.95, 74.95)).toBe(0);
  });
  test("charges only what is missing", () => {
    expect(pixTopUpFor(74.95, 20.1)).toBe(54.85);
    expect(pixTopUpFor(74.95, 0)).toBe(74.95);
  });
  test("respects the gateway minimum", () => {
    expect(pixTopUpFor(74.95, 74.94)).toBe(1);
    expect(pixTopUpFor(74.95, 74.94, 5)).toBe(5);
  });
  test("works in cents, free of floating point noise", () => {
    expect(pixTopUpFor(0.3, 0.1, 0.01)).toBe(0.2);
    expect(pixTopUpFor(1215.3, 1000.1, 0.01)).toBe(215.2);
  });
});
```

- [ ] **Passo 2:** Rodar `npx vitest run src/lib/wallet.test.ts` e ver falhar.
- [ ] **Passo 3: Implementar**

```ts
const toCents = (value: number) => Math.round(value * 100);

/** Amount to top up the wallet so it covers `total`; 0 when the balance is enough. */
export function pixTopUpFor(total: number, balance: number, minimum = 1): number {
  const missing = toCents(total) - toCents(balance);
  if (missing <= 0) return 0;
  return Math.max(missing, toCents(minimum)) / 100;
}
```

- [ ] **Passo 4:** Rodar e ver passar.
- [ ] **Passo 5:** Commit `feat: calcula o valor do PIX de recarga`.

O mínimo real do gateway PIX vem da Fase 0 e vira o valor padrão.

#### Task 11 (Tarefa 3.2): Saldo e recarga PIX

**Files:**
- Modify: `src/lib/shipments.ts`
- Create: `src/app/api/shipments/wallet/route.ts` (GET saldo), `src/app/api/shipments/wallet/pix/route.ts` (POST gera, GET consulta)
- Test: `src/lib/shipments.test.ts`

Regras obrigatórias:

- O servidor recebe só os ids dos pedidos, busca os preços no carrinho e o saldo, e calcula o PIX com `pixTopUpFor`. Um valor enviado pelo cliente é ignorado.
- O retorno para a tela traz só o necessário: QR Code, copia-e-cola, valor, expiração e id do pagamento. Nunca o objeto `user` que a API devolve.

Código detalhado depois da Tarefa 0.3.

#### Task 12 (Tarefa 3.3): Pagamento dos pedidos

**Files:**
- Create: `src/app/api/shipments/checkout/route.ts`, `src/components/contract/PaymentStep.tsx`
- Test: `src/lib/shipments.test.ts`

Casos de teste obrigatórios:

- Saldo suficiente: chama `POST /shipment/checkout` com todos os ids e devolve o protocolo da compra.
- Saldo insuficiente: responde 409 com `{ "error": "Saldo insuficiente.", "pix": <valor> }` e não chama o checkout.
- Review Focus 1: a API responde 422 "One or more orders have already been paid." O app consulta os pedidos, confirma que estão pagos e segue como sucesso. O botão Pagar fica desabilitado enquanto a chamada está em andamento.

#### Task 13 (Tarefa 3.4): Espera do PIX e retomada

**Files:**
- Create: `src/components/contract/PixPanel.tsx`
- Modify: `src/components/contract/PaymentStep.tsx`

Comportamento obrigatório:

- Consulta a confirmação a cada 5 segundos enquanto a aba está visível (`document.visibilityState`) e para ao expirar o PIX.
- Assim que o saldo cobre o total, chama o checkout sozinho.
- Review Focus 3: os ids dos pedidos pendentes ficam em `localStorage`. Ao reabrir o app, um aviso "Você tem um envio aguardando pagamento" leva à etapa de pagamento, que usa o saldo que já entrou.

### Fase 4 — Etiqueta

**Entrega:** depois de pago, o usuário imprime a etiqueta e vê o rastreio.

#### Task 14 (Tarefa 4.1): Geração

**Files:**
- Create: `src/app/api/shipments/labels/route.ts`, `src/components/contract/LabelStep.tsx`
- Test: `src/lib/shipments.test.ts`

Casos de teste obrigatórios:

- Gera todos os pedidos em uma chamada e devolve o resultado de cada um.
- Review Focus 4: com dois pedidos e resposta `{ a: { status: true }, b: { status: false, message: "..." } }`, a tela mostra a etiqueta A pronta e a B com a mensagem e o botão "Tentar de novo", que gera só a B.

#### Task 15 (Tarefa 4.2): Impressão sem expor dados pessoais

**Files:**
- Create: `src/app/api/shipments/labels/print/route.ts`

Regra obrigatória: não usar o modo `public`, que deixa a etiqueta, com nome, endereço e telefone do destinatário, aberta para qualquer pessoa com o link. Duas saídas possíveis, conforme a Tarefa 0.2 passo 3:

- Preferida: o servidor baixa o arquivo da etiqueta com o token e o repassa ao usuário logado.
- Alternativa: link `private`, que exige estar logado no painel do Melhor Envio no mesmo navegador.

### Fase 5 — Tela Envios

**Entrega:** lista dos envios da conta com status, rastreio, reimpressão e cancelamento.

#### Task 16 (Tarefa 5.1): Listagem

**Files:**
- Create: `src/app/envios/page.tsx`, `src/app/api/shipments/route.ts`, `src/components/ShipmentsList.tsx`

Comportamento: filtro por status, 10 por página como a API, mostra só os pedidos com a tag do app por padrão e todos com um filtro. Pedido pendente de pagamento tem o botão "Pagar", que abre a etapa de pagamento.

#### Task 17 (Tarefa 5.2): Cancelamento

**Files:**
- Create: `src/app/api/shipments/[id]/cancel/route.ts`

Comportamento: confirmação explícita ("Cancelar a etiqueta de R$ X? O valor volta para a carteira em até 12 horas."), `reason_id: "2"`, e mensagem clara quando a transportadora já recebeu o pacote e o cancelamento não é mais possível.

---

## 6. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Formato da resposta do PIX diferente do documentado (o exemplo traz `link: null`) | Fase 3 muda | Tarefa 0.3 antes de qualquer código de pagamento. |
| Sandbox sem PIX e só com Correios e Jadlog | Parte do fluxo só é testável em produção | Fixtures de produção com valores mínimos e um roteiro de teste manual antes de liberar para a equipe. |
| Escopo que falta no token | 403 em produção | Tarefa 0.2 registra o escopo de cada chamada. |
| App público com botão de compra | Qualquer pessoa gasta o saldo da empresa | Fase 1 antes de todas as outras em produção, e `requireSession` em cada rota. |
| Preço do carrinho diferente da cotação | Cobrança inesperada | Revisão obrigatória com o preço do carrinho. |
| Correios com vários volumes geram várias etiquetas | Custo e conferência confusos | Resultado por etiqueta na tela e na lista de envios. |
| Azul Cargo, o serviço mais usado da conta, não existe no sandbox | O fluxo da Azul só é exercitado em produção | Primeiro envio real pela Azul acompanhado, com cancelamento como rede de segurança. |
| Token com todos os 29 escopos, inclusive alterar a conta e apagar webhooks | Um vazamento daria controle da conta, não só de etiquetas | Token só no servidor. Depois da Fase 0, gerar outro apenas com os escopos que as chamadas usaram. |
| Repositório público no GitHub | Dados do remetente publicados se forem para o código | Dados do remetente em variável de ambiente, ou repositório privado. |

---

## 7. Critérios de aceite

- [ ] Sem login, nenhuma página ou rota de API responde com dados.
- [ ] Do resultado da cotação até a etiqueta impressa, o usuário não precisa abrir o painel do Melhor Envio.
- [ ] O preço pago é sempre o preço que o usuário viu na revisão.
- [ ] Com saldo suficiente, nenhum PIX é gerado. Sem saldo, o PIX é só da diferença.
- [ ] Clicar duas vezes em Pagar não gera duas compras.
- [ ] Um PIX pago com a aba fechada pode ser aproveitado depois, sem pagar de novo.
- [ ] Etiquetas não ficam acessíveis por link público.
- [ ] Todos os testes, o typecheck e o lint passam em cada fase.

---

## Respostas às decisões

Respondidas em 28/09/2026. Os dados da conta foram lidos com o token novo, só por chamadas de leitura.

| # | Resposta | Efeito no plano |
|---|---|---|
| D1 | Empresa única, 3 ou 4 usuários da equipe, carteira do Melhor Envio da empresa. | Como recomendado. |
| D2 | Usar o saldo primeiro e cobrar no PIX só a diferença. | Como recomendado. O saldo hoje é R$ 0,00, então no começo toda compra passa por PIX. |
| D3 | Depende do envio. | A etapa Conteúdo oferece as duas opções. Serviços que exigem NF-e só aparecem como contratáveis quando o usuário escolhe NF-e. Nos últimos 150 envios da conta foram 86 com NF-e e 64 com declaração. A descrição padrão com o atalho Triband é "Pulseira Tri Band", como nos envios anteriores. |
| D4 | As "unidades" são as duas origens do app. | A conta tem uma empresa e dois endereços cadastrados, exatamente os CEPs de Porto Alegre e Santa Cruz do Sul. Os envios recentes das duas origens usam o **mesmo CNPJ**, com inscrição estadual preenchida. Os dados completos do remetente serão copiados do último envio de cada origem e confirmados pelo usuário. Como o repositório é público, esses dados não entram no código: ficam em variável de ambiente, a menos que o repositório seja tornado privado. |
| D5 | Agências: usar as que a equipe já usa. | Agências mais usadas no histórico: Azul Cargo em Santa Cruz, "CSUF1", R. Vinte e Oito de Setembro, id 5692; Azul Cargo "QNS02", Av. Getúlio Vargas, `unit_id` 5677; Jadlog em Santa Cruz, "CO SANTA CRUZ DO SUL 02", R. José do Patrocínio, id 214; Buslog em Porto Alegre, R. Voluntários da Pátria. Cada uma vira a agência padrão da sua transportadora e origem, com opção de trocar na tela. |
| D6 | Acesso único para toda a equipe, sem perfis. | Senha única compartilhada, como recomendado. |

Credenciais em 28/09/2026:

- Token novo salvo como `MELHOR_ENVIO_TOTAL`, com 29 escopos, válido até 28/09/2027. Ele cota normalmente. Na implementação ele passa a ser o `MELHOR_ENVIO_TOKEN`, local e na Vercel, e o token antigo sai.
- Conta de sandbox criada. Falta gerar o token de sandbox.
- Teste do PIX de R$ 1,00 ainda não autorizado.

Fatos da conta que mudam o plano:

- **Ids de agência:** o pedido guarda a agência com um id em texto (`664162e8…`) e um `unit_id` numérico. O carrinho usa o id numérico da listagem de agências (`/shipment/agencies`). A Tarefa 2.3 guarda o id numérico.
- **Azul Cargo não existe no sandbox,** que só tem Correios e Jadlog. A Azul e-commerce empata com o PAC como serviço mais usado da conta (44 dos últimos 150 envios). O primeiro envio real pela Azul vai servir de teste e deve ser acompanhado.
- **Transferências entre as unidades** (Porto Alegre ↔ Santa Cruz) têm remetente e destinatário com o mesmo CNPJ. O item 5 do Review Focus se aplica de fato.
