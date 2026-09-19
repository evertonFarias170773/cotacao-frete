"use client";

import { MapPin } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { ORIGINS } from "@/config/origins";
import { formatCep } from "@/lib/format";
import type { QuoteFormInput } from "@/lib/schemas";

export function OriginSelector() {
  const { control, setValue } = useFormContext<QuoteFormInput>();
  const selected = useWatch({ control, name: "originId" });

  return (
    <div role="radiogroup" aria-label="Origem do envio" className="grid grid-cols-2 gap-3">
      {ORIGINS.map((origin) => {
        const active = origin.id === selected;
        return (
          <button
            key={origin.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() =>
              setValue("originId", origin.id, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
            }
            className={`card flex min-h-24 flex-col items-start gap-1 p-4 text-left transition ${
              active
                ? "border-accent bg-accent-soft ring-2 ring-accent"
                : "hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
          >
            <MapPin className={`h-5 w-5 ${active ? "text-accent-fg" : "text-zinc-400"}`} aria-hidden />
            <span className="font-semibold leading-tight">{origin.name}</span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">CEP {formatCep(origin.cep)}</span>
          </button>
        );
      })}
    </div>
  );
}
