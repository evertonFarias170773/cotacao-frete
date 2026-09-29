"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { callApi } from "@/lib/apiClient";
import type { QuoteRequest } from "@/lib/schemas";
import type { QuoteOption } from "@/lib/types";
import { LabelPanel } from "../payment/LabelPanel";
import { PaymentPanel } from "../payment/PaymentPanel";
import { compareNfeWithQuote } from "@/lib/nfeChecks";
import { recipientFromNfe, type RecipientInput } from "@/lib/recipient";
import { compareNfeWithVibe, type LoadedNfe, type VibeSelection } from "@/lib/vibe";
import type { AgencyChoice } from "./AgencyPicker";
import { DocumentStep, type DocumentResult } from "./DocumentStep";
import { RecipientStep } from "./RecipientStep";
import { ReviewStep } from "./ReviewStep";
import { StepShell } from "./StepShell";
import { EMPTY_RECIPIENT, type CartResult, type ContractDraft } from "./types";

type Step = "document" | "recipient" | "review" | "payment" | "label";

// The document comes first: an NF-e XML fills the recipient, so the user only checks it.
const STEPS: { id: Step; label: string }[] = [
  { id: "document", label: "Documento" },
  { id: "recipient", label: "Destinatário" },
  { id: "review", label: "Revisão" },
  { id: "payment", label: "Pagamento" },
  { id: "label", label: "Etiqueta" },
];

type Props = {
  option: QuoteOption;
  quote: QuoteRequest;
  /** Vibe order on the quote screen, with its invoice if one was attached there. */
  vibe?: VibeSelection | null;
  /** Closes the contract and redoes the quote with an invoice whose CEP differs. */
  onRequoteWithInvoice?: (invoice: LoadedNfe) => void;
  onClose: () => void;
};

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

export function ContractDialog({ option, quote, vibe = null, onRequoteWithInvoice, onClose }: Props) {
  const declaredValue = quote.volumes.reduce((total, volume) => total + volume.insurance * volume.quantity, 0);
  const [step, setStep] = useState<Step>("document");
  const [draft, setDraft] = useState<ContractDraft>(() => initialDraft(vibe, quote.destinationCep, declaredValue));
  // Changes whenever a new XML fills the recipient, so the form starts over with its data.
  const [recipientVersion, setRecipientVersion] = useState(0);
  const [cart, setCart] = useState<CartResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once paid, or once a PIX exists for them, the orders must stay: the money is on its way.
  const [paid, setPaid] = useState(false);
  const [pixCreated, setPixCreated] = useState(false);

  /** Items left unpaid in the Melhor Envio cart are removed when the user backs out. */
  function discardCart() {
    if (!cart || paid || pixCreated) return;
    const orders = cart.orders.map((order) => order.id);
    setCart(null);
    void callApi("/api/shipments/cart", { method: "DELETE", body: { orders } }).catch(() => undefined);
  }

  function close() {
    discardCart();
    onClose();
  }

  // The Escape key needs the latest close handler (it depends on the cart) without re-binding.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [busy]);

  function documentChosen(result: DocumentResult) {
    setDraft((current) => ({
      ...current,
      source: result.source,
      content: result.content,
      nfe: result.source === "xml" ? (result.nfe ?? current.nfe) : undefined,
      recipient: result.recipient ?? current.recipient,
    }));
    if (result.recipient) setRecipientVersion((version) => version + 1);
    setStep("recipient");
  }

  async function putInCart(recipient: RecipientInput, agency: AgencyChoice) {
    const next: ContractDraft = { ...draft, recipient, agencyId: agency?.id, agencyName: agency?.name };
    setDraft(next);
    setBusy(true);
    setError(null);
    try {
      const result = await callApi<CartResult>("/api/shipments/cart", {
        method: "POST",
        body: {
          quote,
          serviceId: option.id,
          recipient,
          content: next.content,
          agencyId: agency?.id,
          vibeOrder: vibe?.order.id,
        },
      });
      setCart(result);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível montar o envio.");
    } finally {
      setBusy(false);
    }
  }

  const current = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-title"
        className="flex h-full w-full flex-col bg-surface sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:shadow-xl"
      >
        <header className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <h2 id="contract-title" className="text-lg font-semibold">
              Contratar envio
            </h2>
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              {option.company} · {option.service}
            </p>
            <ol className="mt-3 flex gap-1.5" aria-label="Etapas">
              {STEPS.map((s, index) => (
                <li
                  key={s.id}
                  aria-current={index === current ? "step" : undefined}
                  className={`h-1.5 flex-1 rounded-full ${index <= current ? "bg-accent" : "bg-zinc-200 dark:bg-zinc-700"}`}
                  title={s.label}
                />
              ))}
            </ol>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Etapa {current + 1} de {STEPS.length}: {STEPS[current].label}
            </p>
          </div>
          <button type="button" onClick={close} disabled={busy} className="btn-icon -mr-2" aria-label="Fechar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        {step === "document" && (
          <DocumentStep
            destinationCep={quote.destinationCep}
            companyId={option.companyId}
            declaredValue={declaredValue}
            initial={{ source: draft.source, content: draft.content, nfe: draft.nfe }}
            vibe={vibe?.order}
            onRequote={
              vibe && onRequoteWithInvoice
                ? (invoice) => {
                    discardCart();
                    onRequoteWithInvoice(invoice);
                  }
                : undefined
            }
            onCancel={close}
            onNext={documentChosen}
          />
        )}
        {step === "recipient" && (
          <RecipientStep
            key={recipientVersion}
            destinationCep={quote.destinationCep}
            origin={quote.originId}
            companyId={option.companyId}
            initial={draft.recipient}
            initialAgencyId={draft.agencyId}
            prefilledNote={
              draft.source === "xml" && draft.nfe
                ? `Dados preenchidos pela NF-e nº ${draft.nfe.number}.`
                : vibe
                  ? `Dados preenchidos pelo pedido ${vibe.order.id} do Vibe.`
                  : undefined
            }
            busy={busy}
            error={error}
            onBack={() => {
              setError(null);
              setStep("document");
            }}
            onNext={(recipient, agency) => void putInCart(recipient, agency)}
          />
        )}
        {step === "review" && cart && (
          <ReviewStep
            option={option}
            quote={quote}
            draft={draft}
            cart={cart}
            onBack={() => {
              discardCart();
              setStep("recipient");
            }}
            onNext={() => setStep("payment")}
          />
        )}
        {step === "payment" && cart && (
          <StepShell back={pixCreated ? undefined : { label: "Voltar", onClick: () => setStep("review") }}>
            <PaymentPanel
              orders={cart.orders.map((order) => order.id)}
              total={cart.total}
              label={`${option.company} · ${option.service} para ${draft.recipient.name}`}
              onPixCreated={() => setPixCreated(true)}
              onPaid={() => {
                setPaid(true);
                setStep("label");
              }}
            />
            {pixCreated && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Pode fechar esta tela: o envio fica guardado e a compra pode ser concluída depois na tela Envios.
              </p>
            )}
          </StepShell>
        )}
        {step === "label" && cart && (
          <StepShell next={{ label: "Concluir", onClick: onClose }}>
            <LabelPanel orders={cart.orders.map((order) => order.id)} />
          </StepShell>
        )}
      </div>
    </div>
  );
}
