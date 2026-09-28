# Cotador de Fretes (PWA)

Cotação rápida de fretes pela API do Melhor Envio. Funciona no navegador do PC e no celular
(instalável na tela inicial). Sem banco de dados: a última origem e as últimas 10 cotações
ficam no `localStorage` do próprio aparelho.

## Rodando

```bash
npm install
cp .env.example .env.local   # e preencha o token
npm run dev                  # http://localhost:3000
```

Variáveis de ambiente (lidas **só no servidor**, nunca chegam ao navegador):

| Variável | Uso |
|---|---|
| `MELHOR_ENVIO_TOKEN` | Token gerado no painel do Melhor Envio. Sandbox e produção usam tokens diferentes. |
| `MELHOR_ENVIO_ENV` | `production` (padrão) ou `sandbox`. |
| `MELHOR_ENVIO_USER_AGENT` | Exigido pela API: nome da aplicação + e-mail de contato técnico. |
| `MELHOR_ENVIO_SANDBOX_TOKEN` | Token do sandbox, usado quando `MELHOR_ENVIO_ENV=sandbox`. |
| `APP_PASSWORD` | Senha única da equipe, pedida na tela `/entrar`. |
| `SESSION_SECRET` | Segredo que assina o cookie de sessão, com 32 caracteres ou mais. Sem ele o app nega todo acesso. |
| `SENDERS_JSON` | Dados completos do remetente de cada origem, em JSON de uma linha. Fica fora do código porque o repositório é público. Formato em `.env.example`. |

O token precisa dos escopos de carrinho, compra, geração, impressão, cancelamento, saldo e envios, e não só `shipping-calculate`. A lista está no plano em `docs/superpowers/plans/`.

O app inteiro exige login com a senha da equipe. A sessão dura 12 horas e o botão Sair encerra antes.

Origens fixas ficam em [src/config/origins.ts](src/config/origins.ts).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (sem service worker). |
| `npm run build && npm start` | Build de produção; é aqui que o PWA e o service worker entram em ação. |
| `npm test` | Testes unitários (Vitest) da lógica pura: schemas, payload, normalização, erros, storage, atalhos de produto e cliente da API. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `node scripts/icons.mjs` | Regenera os ícones PNG do PWA a partir do SVG embutido. |

## Atalho por produto (Triband)

Dentro de "Volumes" existe o atalho **Cotar Triband**: o usuário informa só a quantidade de
unidades e o app monta os volumes. Os números do produto ficam em
[src/config/products.ts](src/config/products.ts) e a divisão em
[src/lib/presets.ts](src/lib/presets.ts).

Cada unidade empilha na altura sobre uma base fixa de 22 × 32 cm:

| Unidades | Volumes | Pacote (L × C × A) | Peso | Valor declarado |
|---|---|---|---|---|
| 1 | 1 | 22 × 32 × 2,4 cm | 1,05 kg | R$ 135,00 |
| 15 | 1 | 22 × 32 × 36 cm | 15,75 kg | R$ 2.025,00 |
| 18 | 2 | 22 × 32 × 21,6 cm cada | 9,45 kg cada | R$ 1.215,00 cada |

Acima de 15 unidades por volume, o app usa o menor número de volumes possível e divide as unidades
o mais igualmente que der (18 vira 9 + 9; 17 vira 9 + 8). Volumes idênticos são agrupados em um só
cartão usando o campo Quantidade, que o backend expande de novo no payload. O teto é de 300 unidades
por cotação, o que mantém os volumes dentro dos limites do formulário.

Para cadastrar outro produto, acrescente uma entrada em `PRODUCT_PRESETS` com largura, comprimento,
altura/peso/preço unitários e o máximo por volume. A interface cria o atalho sozinha.

## Resultado sempre coerente com o formulário

Cada cotação guarda a "impressão digital" dos dados que a geraram
([src/lib/signature.ts](src/lib/signature.ts)): origem, CEP de destino, todos os campos de cada
volume e as opções adicionais. A lista só aparece na tela enquanto essa impressão digital bate com
o formulário atual.

Na prática, mudou qualquer coisa que altera o preço, a lista some na hora. Se o formulário estiver
válido e houver internet, o app refaz a cotação sozinho 600 ms depois da última edição, o que evita
uma chamada por tecla digitada. Se ficar incompleto, a lista some e nenhuma chamada é feita até
voltar a ser válido.

A impressão digital normaliza a forma de digitar, então `01018-020` e `01018020`, ou `9,45` e
`9.45`, não disparam recálculo. Desfazer uma edição e voltar exatamente aos valores anteriores
também não refaz a chamada: a lista que já estava em memória volta a ser válida. Ela também serve
de identificador no histórico, para uma cotação repetida subir de posição em vez de duplicar.

## Contratação, pagamento e etiqueta

Em cada resultado da cotação, **Contratar este frete** abre uma tela em etapas:

1. **Documento.** Três opções:
   - **Nota fiscal (XML):** o arquivo é lido no próprio aparelho, sem ir a nenhum servidor, e preenche o destinatário e a chave. Se o CEP da nota for diferente do cotado, a tela bloqueia e pede nova cotação. Se o valor da nota for diferente do declarado, ou se faltar o protocolo da SEFAZ, a tela avisa.
   - **Só a chave da NF-e:** chave modelo 55, com o destinatário digitado.
   - **Declaração de conteúdo:** sem nota fiscal.
2. **Destinatário.** Nome, CPF ou CNPJ (inclusive o CNPJ alfanumérico), telefone e endereço, já preenchidos quando veio o XML. O endereço que faltar vem do CEP cotado pelo ViaCEP, e o CEP não muda sem nova cotação. Transportadoras que deixam o pacote numa agência (Jadlog, LATAM, Azul, Buslog, Total Express) mostram a agência padrão de cada origem, definida em `src/config/agencies.ts`, com opção de trocar.
3. **Revisão.** O envio entra no carrinho do Melhor Envio e a tela mostra o preço confirmado por ele, com aviso se mudou em relação à cotação. Com NF-e, o servidor também avisa quando a nota foi emitida por um CNPJ diferente do remetente. Voltar ou fechar remove o item do carrinho.
4. **Pagamento.** Com saldo suficiente na carteira, o pagamento é imediato. Sem saldo, o app gera um PIX só da diferença, espera a confirmação e conclui a compra sozinho. O valor do PIX é sempre calculado no servidor.
5. **Etiqueta.** O app pede a geração, acompanha até ficar pronta e oferece **Imprimir etiqueta**. O PDF é baixado pelo servidor e entregue só a quem está logado, sem link público. Correios, Loggi e J&T geram uma etiqueta por volume.

A tela **Envios** (`/envios`) lista os envios da conta, com filtro por status, e os itens do carrinho aguardando pagamento. Por ela também se retoma um PIX gerado antes de fechar a aba, se gera ou imprime etiqueta e se cancela uma etiqueta paga ainda não postada. O estorno do cancelamento volta para a carteira em até 12 horas.

Pagar duas vezes os mesmos envios, por clique duplo ou nova tentativa, não cobra de novo.

### Testando sem gastar

Suba o servidor com o sandbox do Melhor Envio. Ele tem R$ 10.000,00 de saldo fictício, mas só simula Correios e Jadlog e não tem PIX:

```bash
MELHOR_ENVIO_ENV=sandbox npm run dev
```

O script `node scripts/spike-sandbox.mjs` percorre o fluxo inteiro da API no sandbox e regrava as respostas usadas como fixtures nos testes.

## Como funciona

```
navegador  ──POST /api/quote──▶  route.ts  ──▶  lib/melhorEnvio.ts  ──▶  Melhor Envio
   ▲                                │                (server-only, token do .env)
   └── QuoteResult (ordenado) ◀─────┘  lib/normalize.ts
```

- O front envia `{ originId, destinationCep, volumes[], options }`; o CEP de origem é resolvido no servidor.
- `quantity` > 1 vira volumes repetidos no payload (`lib/payload.ts`).
- A API é chamada no modo `volumes`; se ela responder 422 pedindo `products`, o cliente refaz a chamada
  uma vez no modo `products` (plano B isolado em `buildProductsPayload`).
- A resposta é validada com Zod de forma tolerante (campos extras passam) e normalizada: usa
  `custom_price` / `custom_delivery_range`, ordena por preço e depois por prazo, e separa os serviços com `error`
  em "Indisponíveis".
- Timeout de 15 s na chamada externa; erros viram mensagens amigáveis e nunca expõem token ou headers.

## PWA

- Manifesto gerado por [src/app/manifest.ts](src/app/manifest.ts) (`/manifest.webmanifest`), ícones em `public/icons`.
- Service worker em [public/sw.js](public/sw.js): cache do app shell e dos assets estáticos, **nunca** de `/api/*`.
  Só é registrado em build de produção.
- Para testar instalação e offline: `npm run build && npm start` e use o Lighthouse ou o DevTools > Application.
