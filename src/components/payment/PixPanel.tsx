"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { callApi } from "@/lib/apiClient";
import { formatCurrency } from "@/lib/format";
import type { PendingPix } from "@/lib/storage";

const POLL_MS = 5000;
const expiry = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Props = {
  pix: PendingPix;
  /** Called once the payment shows as paid; the parent then pays the orders. */
  onPaid: () => void;
  /** Called when the PIX was cancelled or expired. */
  onFailed: () => void;
};

/** QR code, copy-and-paste code, and a quiet check every 5 seconds while the tab is visible. */
export function PixPanel({ pix, onPaid, onFailed }: Props) {
  const [copied, setCopied] = useState(false);
  const expiresAt = pix.expiresAt ? new Date(pix.expiresAt) : null;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (document.visibilityState === "visible") {
        try {
          const { status } = await callApi<{ status: "pending" | "paid" | "failed" }>(
            `/api/shipments/wallet/pix?id=${encodeURIComponent(pix.paymentId)}`,
          );
          if (!active) return;
          if (status === "paid") return onPaid();
          if (status === "failed") return onFailed();
        } catch {
          // A failed check is retried on the next tick.
        }
      }
      if (active) timer = setTimeout(check, POLL_MS);
    };
    timer = setTimeout(check, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pix.paymentId, onPaid, onFailed]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pix.copyPaste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the code is selectable in the text box.
    }
  }

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Pague {formatCurrency(pix.amount)} com PIX. O recebedor aparece como VINDI, o intermediador do Melhor Envio.
      </p>
      {/* The QR code is an SVG served by the payment gateway. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pix.qrCodeUrl}
        alt="QR Code do PIX"
        width={220}
        height={220}
        className="mx-auto h-56 w-56 rounded-xl bg-white p-2"
      />
      <div className="text-left">
        <label htmlFor="pix-code" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          PIX copia e cola
        </label>
        <textarea
          id="pix-code"
          readOnly
          rows={3}
          value={pix.copyPaste}
          onFocus={(event) => event.currentTarget.select()}
          className="field h-auto resize-none py-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Código copiado" : "Copiar código"}
        </button>
      </div>
      <p className="flex items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Aguardando o pagamento. A etiqueta é comprada assim que o PIX cair.
      </p>
      {expiresAt && !Number.isNaN(expiresAt.getTime()) && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Válido até {expiry.format(expiresAt)}.</p>
      )}
    </div>
  );
}
