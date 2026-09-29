"use client";

import { MapPin } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { ORIGINS } from "@/config/origins";
import { formatCep } from "@/lib/format";
import type { QuoteFormInput } from "@/lib/schemas";

/** `locked` while a Vibe order is on screen: those always leave from Porto Alegre. */
export function OriginSelector({ locked = false }: { locked?: boolean }) {
  const { control, setValue } = useFormContext<QuoteFormInput>();
  const selected = useWatch({ control, name: "originId" });

  return (
    <div>
      <div role="radiogroup" aria-label="Origem do envio" className="grid grid-cols-2 gap-3">
        {ORIGINS.map((origin) => {
          const active = origin.id === selected;
          return (
            <button
              key={origin.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={locked}
              onClick={() =>
                setValue("originId", origin.id, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
              }
              className={`card flex min-h-24 flex-col items-start gap-1 p-4 text-left transition disabled:cursor-not-allowed ${
                active
                  ? "border-accent bg-accent-soft ring-2 ring-accent"
                  : "hover:border-zinc-300 disabled:opacity-50 dark:hover:border-zinc-700"
              }`}
            >
              <MapPin className={`h-5 w-5 ${active ? "text-accent-fg" : "text-zinc-400"}`} aria-hidden />
              <span className="font-semibold leading-tight">{origin.name}</span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">CEP {formatCep(origin.cep)}</span>
            </button>
          );
        })}
      </div>
      {locked && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Pedidos do Vibe saem sempre de Porto Alegre.</p>
      )}
    </div>
  );
}
