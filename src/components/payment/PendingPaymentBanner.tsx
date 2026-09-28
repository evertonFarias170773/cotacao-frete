"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { formatCurrency } from "@/lib/format";
import { loadPendingPayment } from "@/lib/storage";

/** Reminds the team of a PIX generated earlier whose purchase was not finished (tab closed, for instance). */
export function PendingPaymentBanner() {
  const hydrated = useHydrated();
  const [pending] = useState(() => (typeof window === "undefined" ? null : loadPendingPayment()));
  if (!hydrated || !pending) return null;

  return (
    <Link
      href="/envios#pagamento-pendente"
      className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <Clock className="h-5 w-5 shrink-0" aria-hidden />
      <span className="flex-1">
        <span className="block font-semibold">Você tem um envio aguardando pagamento</span>
        {pending.label} · PIX de {formatCurrency(pending.pix.amount)}
      </span>
      <span className="font-semibold underline">Concluir</span>
    </Link>
  );
}
