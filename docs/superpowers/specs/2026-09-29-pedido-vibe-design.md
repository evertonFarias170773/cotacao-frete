# Etiqueta a partir do pedido do Vibe — Desenho

**Data:** 29/09/2026
**Situação:** aprovado na conversa, aguardando revisão deste documento.

## Objetivo

Quem já vai partir para a etiqueta digita o nº do pedido no Vibe (ex.: `22773`) e o app preenche a cotação e o contrato sozinho. O que importa do pedido é o **peso**, o **CEP** e o **nome do cliente**.

A cotação manual continua exatamente como está.

## A API do Vibe

- `GET {VIBE_API_URL}/{id_int}` com o cabeçalho `x-api-key`. Só lê, nunca altera o Vibe.
- Campos usados: `entrega.destinatario` (nome, documento, e-mail, telefone), `entrega.endereco` (CEP, logradouro, número, complemento, bairro, cidade, UF), `peso_aferido_kg`, `volumes.quantidade` e `volumes.lista[].peso_kg`.
- Campos ignorados: `pagador`, `valor_total`, `envio`, `entrega.recebedor` e as medidas dos volumes (sempre `null`).
- Campo sem dado vem `null`, nunca `""`.
- Erros: 401 (chave), 404 (pedido não existe ou não é do cliente), 429 (30 consultas por minuto), 500. Corpo `{ erro, mensagem }`.

## Regras de negócio

### Origem

Pedido do Vibe sai sempre de **Porto Alegre** (`poa`). Na Azul, a agência padrão de Porto Alegre já é a de Canoas (5677), sem mudança.

### Caixas

A caixa é sempre a mesma, base **22 × 32 cm**, e só a altura muda. No pedido do Vibe tudo sai do peso:

| Medida | Regra |
|---|---|
| Quantidade de caixas | `volumes.quantidade` (se vier `null` ou 0, 1 caixa) |
| Peso de cada caixa | `volumes.lista[].peso_kg` quando **todas** as caixas têm peso; senão `peso_aferido_kg` dividido igualmente |
| Altura | peso da caixa × **2,4 cm** |
| Valor declarado | peso da caixa × **R$ 135** |

- Os números são os mesmos do atalho da Triband ([products.ts](../../../src/config/products.ts)), trocando "por unidade" por "por kg". O código lê de lá, sem repetir os valores.
- Arredondamento: peso com 3 casas, altura e valor com 2.
- Caixas iguais viram uma linha do formulário com quantidade, como o atalho já faz.
- Exemplo: 1 caixa, 4,95 kg → 22 × 32 × 11,88 cm, R$ 668,25.

### Pedido sem peso

Se `peso_aferido_kg` vier `null` (ou 0) e as caixas não tiverem peso, o pedido ainda não passou pelo despacho. O app mostra "Esse pedido ainda não foi pesado no despacho." e não preenche nada.

### Destinatário e nota fiscal

- **Sem XML:** o destinatário vem do Vibe.
- **Com XML:** o XML sempre prevalece. O destinatário da nota substitui o do Vibe, e o CEP da nota passa a ser o CEP cotado.
- O app compara a nota com o pedido e avisa, sem bloquear, quando o **CEP**, o **nome** (ignorando maiúsculas, acentos e espaços) ou o **CPF/CNPJ** forem diferentes.
- O valor declarado continua pela regra do peso. O aviso atual de "valor da nota diferente do declarado" continua como hoje.
- A tela do destinatário sempre aparece para conferir e completar o que faltar (o Vibe pode não ter telefone).

## Como a tela funciona

### Quadro "Pedido do Vibe"

No topo da tela de cotação. Só aparece quando `VIBE_API_URL` e `VIBE_API_KEY` estão configuradas.

1. Campo do nº do pedido e botão **Buscar**.
2. Ao buscar, o app põe a origem em Porto Alegre, preenche o CEP e as caixas e cota na hora.
3. O quadro mostra: nº do pedido, nome do cliente, cidade/UF, CEP, peso total e número de caixas.
4. Botões **Anexar XML** (opcional) e **Limpar** (volta à cotação manual, formulário vazio).
5. Enquanto o pedido estiver carregado, **origem e CEP ficam travados**: o endereço vem do pedido ou da nota. As caixas continuam editáveis.

### XML anexado no quadro

- O arquivo é lido no aparelho, como já é hoje ([nfeXml.ts](../../../src/lib/nfeXml.ts)).
- O CEP da nota substitui o do pedido; se mudou, a cotação se refaz sozinha.
- Os avisos de diferença entre nota e pedido aparecem no quadro.
- Um XML com erro (modelo diferente de 55, arquivo inválido) mostra a mesma mensagem de hoje e não muda nada.

### Contrato

- **Documento:** com XML no quadro, a etapa já vem com a nota marcada e carregada. Sem XML, a etapa funciona como hoje.
- **Destinatário:** preenchido pelo XML ou, sem XML, pelo Vibe.
- **XML anexado só dentro do contrato:**
  - mesmo CEP do pedido: segue como hoje, com o destinatário da nota;
  - CEP diferente: no lugar do bloqueio atual aparece o botão **"Refazer a cotação com a nota"**. Ele fecha o contrato, leva o XML para o quadro e recota. A pessoa escolhe a transportadora de novo.
- **Marcação:** o envio ganha a marcação `Vibe 22773` além da atual (`cotador-fretes`), para achar no painel do Melhor Envio. A tela Envios continua reconhecendo os envios do app pela marcação atual.

### Mensagens de erro

| Situação | Mensagem |
|---|---|
| Nº inválido (não numérico, vazio) | "Informe o número do pedido." |
| Pedido não encontrado (404) | "Pedido não encontrado." |
| Pedido sem peso | "Esse pedido ainda não foi pesado no despacho." |
| Muitas consultas (429) | "Muitas consultas seguidas. Espere 1 minuto." |
| Chave recusada (401) | "O Vibe recusou a chave de acesso. Confira a configuração." |
| Vibe fora do ar, demora ou resposta inesperada | "Não foi possível falar com o Vibe agora." |

## Arquitetura

### Segurança

- Duas variáveis novas, só no servidor (sem `NEXT_PUBLIC_`), na Vercel e no `.env.local`:
  - `VIBE_API_URL`: endereço completo até `/pedidos`, sem barra no fim.
  - `VIBE_API_KEY`: a chave.
- O módulo que fala com o Vibe usa `import "server-only"`. A chave nunca vai para o navegador, para log ou para o GitHub.
- A rota exige sessão (`requireSession`), como as demais.
- A rota devolve só a visão reduzida do pedido: destinatário, endereço de entrega, peso e caixas.
- Logs: só o nº do pedido e o tipo de falha. Nunca chave, nome ou endereço.
- Fixtures de teste com dados fictícios (o repositório é público). O nome do cliente e o caminho da API ficam fora do código, dentro de `VIBE_API_URL`.
- O nº do pedido é validado (`^\d{1,9}$`) antes de entrar na URL.

### Unidades

| Arquivo | Papel |
|---|---|
| `src/lib/vibe.ts` | Regras puras: schema da resposta, visão reduzida do pedido, caixas a partir do peso, destinatário no formato do contrato, comparação nota × pedido. |
| `src/lib/vibeClient.ts` (server-only) | Chamada ao Vibe com a chave, limite de 10 s, tradução dos erros para `QuoteError` com status e mensagem. |
| `src/app/api/vibe/orders/[id]/route.ts` | `GET` com sessão; devolve `{ order }` ou `{ error }`. |
| `src/components/vibe/VibeOrderPanel.tsx` | O quadro: busca, resumo, XML, avisos, limpar. |
| `Cotador.tsx` | Guarda o pedido carregado e o XML, preenche o formulário, trava origem e CEP, repassa ao contrato. |
| `ContractDialog.tsx`, `DocumentStep.tsx` | Recebem o pedido e o XML para preencher documento e destinatário; botão "Refazer a cotação com a nota". |
| `recipient.ts`, `shipments.ts` | `vibeOrder` opcional no pedido do contrato, que vira a marcação `Vibe {nº}`. |
| `page.tsx` | Informa ao `Cotador` se o Vibe está configurado. |

### Visão reduzida devolvida ao navegador

```ts
type VibeOrder = {
  id: number;
  recipient: RecipientInput; // campos null viram ""
  postalCode: string;        // 8 dígitos
  totalWeight: number;       // kg
  boxes: PlannedVolume[];    // já com medidas, peso e valor
};
```

## Testes

- **Unidade (TDD):** caixas a partir do peso (1 e várias caixas, pesos por caixa completos e incompletos, quantidade nula, arredondamento); leitura da resposta (campos nulos, pedido sem peso, formato inesperado); cada erro da API; comparação nota × pedido; destinatário no formato do contrato; marcação `Vibe {nº}` no carrinho.
- **Rota:** sem sessão → 401; nº inválido → 400; Vibe não configurado; a resposta não contém a chave nem o pagador.
- **Navegador (Playwright):** Vibe de mentira rodando localmente e Melhor Envio no sandbox. Buscar pedido, conferir caixas e origem, anexar XML com CEP diferente, contratar até a revisão.
- **Vibe de verdade:** só uma busca de leitura, sem imprimir dados pessoais. Nenhuma etiqueta nem pagamento em produção.

## Fora do escopo

- Medidas por caixa vindas do Vibe (a API ainda não tem).
- `entrega.recebedor`: o Melhor Envio não tem campo para quem recebe.
- Guardar pedidos do Vibe no histórico de cotações.
- Usar o `valor_total` do Vibe.
