"use client";

import { History, RotateCw } from "lucide-react";
import { ORIGINS } from "@/config/origins";
import { formatCep, formatCurrency } from "@/lib/format";
import type { HistoryEntry } from "@/lib/storage";

type Props = {
  entries: HistoryEntry[];
  onRepeat: (entry: HistoryEntry) => void;
  disabled?: boolean;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function HistoryList({ entries, onRepeat, disabled }: Props) {
  if (entries.length === 0) return null;

  return (
    <details className="card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium">
        <History className="h-5 w-5 text-zinc-400" aria-hidden />
        Últimas cotações ({entries.length})
      </summary>
      <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
        {entries.map((entry) => {
          const originName = ORIGINS.find((o) => o.id === entry.originId)?.name ?? entry.originId;
          const count = entry.volumes.reduce((total, v) => total + (v.quantity || 1), 0);
          return (
            <li key={entry.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {originName} → {formatCep(entry.destinationCep)}
                </p>
                <p className="truncate text-zinc-500 dark:text-zinc-400">
                  {dateFormat.format(entry.at)} · {count === 1 ? "1 volume" : `${count} volumes`} ·{" "}
                  {entry.bestService} {formatCurrency(entry.bestPrice)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRepeat(entry)}
                disabled={disabled}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-zinc-300 px-3 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <RotateCw className="h-4 w-4" aria-hidden />
                Repetir
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
