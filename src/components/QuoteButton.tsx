"use client";

import { Loader2, Truck } from "lucide-react";

type Props = { loading: boolean; disabled: boolean };

export function QuoteButton({ loading, disabled }: Props) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Truck className="h-5 w-5" aria-hidden />}
      {loading ? "Cotando…" : "Cotar frete"}
    </button>
  );
}
