"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { formatCurrency, formatKg, parseDecimal } from "@/lib/format";
import type { QuoteFormInput } from "@/lib/schemas";

export function VolumesSummary() {
  const { control } = useFormContext<QuoteFormInput>();
  const volumes = useWatch({ control, name: "volumes" }) ?? [];

  let count = 0;
  let weight = 0;
  let declared = 0;
  for (const volume of volumes) {
    const quantity = Math.max(1, Math.floor(parseDecimal(volume?.quantity ?? "") ?? 1));
    count += quantity;
    weight += (parseDecimal(volume?.weight ?? "") ?? 0) * quantity;
    declared += (parseDecimal(volume?.insurance ?? "") ?? 0) * quantity;
  }

  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      {count === 1 ? "1 volume" : `${count} volumes`} · {formatKg(weight)} · {formatCurrency(declared)} declarados
    </p>
  );
}
