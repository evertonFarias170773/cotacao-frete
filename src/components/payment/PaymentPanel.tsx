"use client";

import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, callApi } from "@/lib/apiClient";
import { formatCurrency } from "@/lib/format";
import { clearPendingPayment, loadPendingPayment, savePendingPayment, type PendingPix } from "@/lib/storage";
import { pixTopUpFor } from "@/lib/wallet";
import { PixPanel } from "./PixPanel";

const RETRY_MS = 5000;
const RETRIES_AFTER_PIX = 12;

type Props = {
  orders: string[];
  /** The total the user reviewed. The server refuses to charge anything else. */
  total: number;
  /** Summary shown when the payment is resumed later, e.g. "Correios · PAC para Maria". */
  label: string;
  onPaid: () => void;
  onPixCreated?: () => void;
  /** Called after the user discards a pending PIX. */
  onDiscard?: () => void;
};

type Outcome = "paid" | "insufficient" | "price_changed" | "error";

const sameOrders = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const primaryButton =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-50";
const secondaryButton =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** Pays with the wallet balance, topping it up by PIX first when it is short (decision D2). */
export function PaymentPanel({ orders, total, label, onPaid, onPixCreated, onDiscard }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  // The price the user agreed to; replaced only after they see a new one.
  const [agreedTotal, setAgreedTotal] = useState(total);
  // A PIX generated earlier for these same orders is resumed instead of creating another one.
  const [pix, setPix] = useState<PendingPix | null>(() => {
    const pending = loadPendingPayment();
    return pending && sameOrders(pending.orders, orders) ? pending.pix : null;
  });
  // Once the PIX is known to be paid, never offer to generate another one for these orders.
  const [pixConfirmed, setPixConfirmed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paying = useRef(false);

  useEffect(() => {
    let active = true;
    callApi<{ balance: number }>("/api/shipments/wallet")
      .then(({ balance: value }) => active && setBalance(value))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : "Não foi possível ler o saldo."));
    return () => {
      active = false;
    };
  }, []);

  /** Handles the two 409 answers: balance short (pix) or price changed (total). */
  const handleConflict = useCallback((err: unknown): Outcome | null => {
    if (!(err instanceof ApiError) || err.status !== 409) return null;
    if (typeof err.body?.total === "number") {
      setAgreedTotal(err.body.total);
      setError(`O preço mudou para ${formatCurrency(err.body.total)}. Confira e toque de novo para pagar o novo valor.`);
      return "price_changed";
    }
    const missingPix = err.body?.pix;
    if (typeof missingPix === "number") {
      setBalance((current) => (current === null ? current : Math.min(current, Math.max(0, total - missingPix))));
      return "insufficient";
    }
    return null;
  }, [total]);

  /** One checkout attempt, for the price the user agreed to. Never runs twice at the same time. */
  const pay = useCallback(async (): Promise<Outcome> => {
    if (paying.current) return "error";
    paying.current = true;
    setBusy(true);
    setError(null);
    try {
      await callApi("/api/shipments/checkout", { method: "POST", body: { orders, expectedTotal: agreedTotal } });
      clearPendingPayment();
      onPaid();
      return "paid";
    } catch (err) {
      const conflict = handleConflict(err);
      if (conflict) return conflict;
      setError(err instanceof Error ? err.message : "Não foi possível pagar.");
      return "error";
    } finally {
      paying.current = false;
      setBusy(false);
    }
  }, [orders, agreedTotal, onPaid, handleConflict]);

  /** The PIX landed: the balance can take a while to show, so retry for about a minute. */
  const onPixPaid = useCallback(async () => {
    setPixConfirmed(true);
    setFinishing(true);
    for (let attempt = 0; attempt < RETRIES_AFTER_PIX; attempt++) {
      const outcome = await pay();
      if (outcome !== "insufficient") {
        setFinishing(false);
        return;
      }
      await sleep(RETRY_MS);
    }
    setFinishing(false);
    setError("O PIX foi confirmado, mas o saldo ainda não apareceu na carteira. Toque em Tentar pagar de novo em instantes.");
  }, [pay]);

  const onPixFailed = useCallback(() => {
    clearPendingPayment();
    setPix(null);
    setError("O PIX expirou ou foi cancelado. Gere um novo.");
  }, []);

  /** "Já paguei": one immediate check; the server is the source of truth for the balance. */
  async function alreadyPaid() {
    const outcome = await pay();
    if (outcome === "insufficient") {
      setError("O PIX ainda não caiu na carteira. Aguarde alguns instantes e toque de novo.");
    }
  }

  function discardPix() {
    if (!window.confirm("Descartar este PIX? Se você já pagou, o valor fica no saldo do Melhor Envio.")) return;
    clearPendingPayment();
    setPix(null);
    setPixConfirmed(false);
    setError(null);
    onDiscard?.();
  }

  async function createPix() {
    setBusy(true);
    setError(null);
    try {
      const charge = await callApi<PendingPix | { amount: 0 }>("/api/shipments/wallet/pix", {
        method: "POST",
        body: { orders, expectedTotal: agreedTotal },
      });
      if (!("paymentId" in charge)) {
        // The balance covered it in the meantime.
        setBusy(false);
        await pay();
        return;
      }
      savePendingPayment({ orders, total: agreedTotal, label, pix: charge, createdAt: Date.now() });
      setPix(charge);
      onPixCreated?.();
    } catch (err) {
      if (!handleConflict(err)) setError(err instanceof Error ? err.message : "Não foi possível gerar o PIX.");
    } finally {
      setBusy(false);
    }
  }

  const missing = balance === null ? null : pixTopUpFor(agreedTotal, balance);

  let body: React.ReactNode;
  if (pix && pixConfirmed) {
    body = (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          PIX de {formatCurrency(pix.amount)} confirmado.
        </p>
        {finishing ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Concluindo a compra assim que o saldo aparecer…
          </p>
        ) : (
          <button type="button" onClick={() => void pay()} disabled={busy} className={primaryButton}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            Tentar pagar de novo
          </button>
        )}
      </div>
    );
  } else if (pix) {
    body = (
      <div className="space-y-3">
        <PixPanel pix={pix} onPaid={() => void onPixPaid()} onFailed={onPixFailed} />
        <button type="button" onClick={() => void alreadyPaid()} disabled={busy} className={secondaryButton}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Já paguei
        </button>
        <button
          type="button"
          onClick={discardPix}
          className="w-full text-center text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400"
        >
          Descartar este PIX
        </button>
      </div>
    );
  } else if (balance === null && !error) {
    body = (
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Consultando o saldo da carteira…
      </p>
    );
  } else {
    body = (
      <>
        <dl className="card divide-y divide-zinc-100 px-4 text-sm dark:divide-zinc-800">
          <div className="flex justify-between py-2.5">
            <dt className="text-zinc-500 dark:text-zinc-400">Total do envio</dt>
            <dd className="font-semibold">{formatCurrency(agreedTotal)}</dd>
          </div>
          {balance !== null && (
            <div className="flex justify-between py-2.5">
              <dt className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <Wallet className="h-4 w-4" aria-hidden />
                Saldo no Melhor Envio
              </dt>
              <dd className="font-semibold">{formatCurrency(balance)}</dd>
            </div>
          )}
          {missing !== null && missing > 0 && (
            <div className="flex justify-between py-2.5">
              <dt className="text-zinc-500 dark:text-zinc-400">Falta pagar com PIX</dt>
              <dd className="font-semibold text-accent-fg">{formatCurrency(missing)}</dd>
            </div>
          )}
        </dl>
        {missing === 0 && (
          <button type="button" onClick={() => void pay()} disabled={busy} className={primaryButton}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            Pagar com saldo
          </button>
        )}
        {missing !== null && missing > 0 && (
          <button type="button" onClick={() => void createPix()} disabled={busy} className={primaryButton}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            Gerar PIX de {formatCurrency(missing)}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {body}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
