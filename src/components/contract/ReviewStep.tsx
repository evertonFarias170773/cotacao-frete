"use client";

import { AlertTriangle } from "lucide-react";
import { formatCep, formatCurrency, formatDeliveryRange } from "@/lib/format";
import { priceChangeMessage } from "@/lib/priceChange";
import type { QuoteRequest } from "@/lib/schemas";
import type { QuoteOption } from "@/lib/types";
import type { CartResult, ContractDraft } from "./types";
import { StepShell } from "./StepShell";

type Props = {
  option: QuoteOption;
  quote: QuoteRequest;
  draft: ContractDraft;
  cart: CartResult;
  onBack: () => void;
  onNext: () => void;
};

export function ReviewStep({ option, quote, draft, cart, onBack, onNext }: Props) {
  const volumes = quote.volumes.reduce((total, volume) => total + volume.quantity, 0);
  const change = priceChangeMessage(option.price, cart.total);
  const { recipient, content } = draft;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );

  return (
    <StepShell back={{ label: "Editar", onClick: onBack }} next={{ label: `Pagar ${formatCurrency(cart.total)}`, onClick: onNext }}>
      {change && (
        <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{change} Confira antes de pagar.</span>
        </p>
      )}
      <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {row("Serviço", `${option.company} · ${option.service}`)}
        {row("Prazo", formatDeliveryRange(option.deliveryMin, option.deliveryMax))}
        {row("Volumes", volumes === 1 ? "1 volume" : `${volumes} volumes`)}
        {row(
          "Destinatário",
          <span className="block">
            {recipient.name}
            <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400">
              {recipient.address}, {recipient.number}
              {recipient.complement ? ` ${recipient.complement}` : ""} · {recipient.district} · {recipient.city}/
              {recipient.stateAbbr.toUpperCase()} · {formatCep(quote.destinationCep)}
            </span>
          </span>,
        )}
        {row("Conteúdo", content.kind === "declaration" ? `Declaração: ${content.description}` : "Nota fiscal (NF-e)")}
        {draft.agencyName && row("Agência", draft.agencyName)}
        {row("Preço confirmado", <span className="text-lg font-bold">{formatCurrency(cart.total)}</span>)}
      </dl>
      {cart.orders.length > 1 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Esta transportadora aceita um volume por etiqueta, então serão {cart.orders.length} etiquetas.
        </p>
      )}
    </StepShell>
  );
}
