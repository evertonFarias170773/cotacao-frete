"use client";

import { AlertTriangle, PackageSearch, RotateCw } from "lucide-react";
import { pickBadges } from "@/lib/normalize";
import type { QuoteOption, QuoteResult } from "@/lib/types";
import { ResultItem } from "./ResultItem";

export type QuoteStatus = "idle" | "loading" | "success" | "error";

type Props = {
  status: QuoteStatus;
  result: QuoteResult | null;
  error: string | null;
  onRetry: () => void;
  /** Present only while the list matches the form, so an outdated option can never be contracted. */
  onContract?: (option: QuoteOption) => void;
};

export function ResultsList({ status, result, error, onRetry, onContract }: Props) {
  if (status === "idle") {
    return (
      <div className="card flex flex-col items-center gap-2 p-8 text-center text-zinc-500 dark:text-zinc-400">
        <PackageSearch className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
        <p className="text-sm">Preencha os dados e toque em &ldquo;Cotar frete&rdquo; para ver as opções.</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <ul className="space-y-3" aria-busy="true" aria-label="Cotando frete">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="card flex animate-pulse items-center gap-3 p-4">
            <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <div className="h-6 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
          </li>
        ))}
      </ul>
    );
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        className="card flex flex-col items-center gap-3 border-red-200 p-6 text-center dark:border-red-900/60"
      >
        <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{error ?? "Não foi possível cotar."}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!result) return null;
  const { cheapestId, fastestId } = pickBadges(result.available);

  return (
    <div className="space-y-4">
      {result.available.length === 0 ? (
        <div className="card p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Nenhuma transportadora atende esse trecho com esses volumes.
        </div>
      ) : (
        <ul className="space-y-3">
          {result.available.map((option) => (
            <ResultItem
              key={option.id}
              onContract={onContract ? () => onContract(option) : undefined}
              option={option}
              badge={option.id === cheapestId ? "cheapest" : option.id === fastestId ? "fastest" : undefined}
              highlight={option.id === cheapestId}
            />
          ))}
        </ul>
      )}

      {result.unavailable.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Indisponíveis ({result.unavailable.length})
          </summary>
          <ul className="space-y-3 border-t border-zinc-100 px-4 py-3 text-sm dark:border-zinc-800">
            {result.unavailable.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <p className="font-medium">
                  {item.name}
                  {item.company && <span className="font-normal text-zinc-500"> · {item.company}</span>}
                </p>
                <p className="text-zinc-500 dark:text-zinc-400">{item.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
