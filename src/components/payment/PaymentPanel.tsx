"use client";

import { Loader2, Wallet } from "lucide-react";
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
  total: number;
  /** Summary shown when the payment is resumed later, e.g. "Correios · PAC para Maria". */
  label: string;
  onPaid: () => void;
  onPixCreated?: () => void;
};

const sameOrders = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pays with the wallet balance, topping it up by PIX first when it is short (decision D2). */
export function PaymentPanel({ orders, total, label, onPaid, onPixCreated }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  // A PIX generated earlier for these same orders is resumed instead of creating another one.
  const [pix, setPix] = useState<PendingPix | null>(() => {
    const pending = loadPendingPayment();
    return pending && sameOrders(pending.orders, orders) ? pending.pix : null;
  });
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

  /** One checkout attempt. Never runs twice at the same time. */
  const pay = useCallback(async (): Promise<"paid" | "insufficient" | "error"> => {
    if (paying.current) return "error";
    paying.current = true;
    setBusy(true);
    setError(null);
    try {
      await callApi("/api/shipments/checkout", { method: "POST", body: { orders } });
      clearPendingPayment();
      onPaid();
      return "paid";
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && typeof err.body?.pix === "number") {
        setBalance(Math.max(0, total - err.body.pix));
        return "insufficient";
      }
      setError(err instanceof Error ? err.message : "Não foi possível pagar.");
      return "error";
    } finally {
      paying.current = false;
      setBusy(false);
    }
  }, [orders, total, onPaid]);

  /** The PIX landed: the balance can take a few seconds to show, so retry for about a minute. */
  const onPixPaid = useCallback(async () => {
    for (let attempt = 0; attempt < RETRIES_AFTER_PIX; attempt++) {
      if ((await pay()) !== "insufficient") return;
      await sleep(RETRY_MS);
    }
    setError("O PIX foi confirmado, mas o saldo ainda não apareceu. Toque em pagar de novo em instantes.");
    setPix(null);
  }, [pay]);

  const onPixFailed = useCallback(() => {
    clearPendingPayment();
    setPix(null);
    setError("O PIX expirou ou foi cancelado. Gere um novo.");
  }, []);

  async function createPix() {
    setBusy(true);
    setError(null);
    try {
      const charge = await callApi<PendingPix | { amount: 0 }>("/api/shipments/wallet/pix", {
        method: "POST",
        body: { orders },
      });
      if (!("paymentId" in charge)) {
        // The balance covered it in the meantime.
        setBusy(false);
        await pay();
        return;
      }
      savePendingPayment({ orders, total, label, pix: charge, createdAt: Date.now() });
      setPix(charge);
      onPixCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o PIX.");
    } finally {
      setBusy(false);
    }
  }

  const missing = balance === null ? null : pixTopUpFor(total, balance);

  return (
    <div className="space-y-4">
      {pix ? (
        <PixPanel pix={pix} onPaid={() => void onPixPaid()} onFailed={onPixFailed} />
      ) : balance === null && !error ? (
        <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Consultando o saldo da carteira…
        </p>
      ) : (
        <>
          <dl className="card divide-y divide-zinc-100 px-4 text-sm dark:divide-zinc-800">
            <div className="flex justify-between py-2.5">
              <dt className="text-zinc-500 dark:text-zinc-400">Total do envio</dt>
              <dd className="font-semibold">{formatCurrency(total)}</dd>
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
            <button
              type="button"
              onClick={() => void pay()}
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
              Pagar com saldo
            </button>
          )}
          {missing !== null && missing > 0 && (
            <button
              type="button"
              onClick={() => void createPix()}
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
              Gerar PIX de {formatCurrency(missing)}
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
