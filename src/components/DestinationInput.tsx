"use client";

import { useEffect, useState } from "react";
import { useController, useFormContext } from "react-hook-form";
import { formatCep, onlyDigits } from "@/lib/format";
import type { QuoteFormInput } from "@/lib/schemas";
import { lookupCep, type CepInfo } from "@/lib/viacep";

type Lookup = { cep: string; info: CepInfo | null };

/** `readOnly` while a Vibe order is on screen: the CEP comes from the order or its invoice. */
export function DestinationInput({ readOnly = false }: { readOnly?: boolean }) {
  const { control } = useFormContext<QuoteFormInput>();
  const {
    field: { ref, name, value, onChange, onBlur },
    fieldState,
  } = useController({ control, name: "destinationCep" });
  const digits = onlyDigits(value ?? "");
  const [lookup, setLookup] = useState<Lookup | null>(null);

  useEffect(() => {
    if (digits.length !== 8) return;
    const controller = new AbortController();
    lookupCep(digits, controller.signal)
      .then((info) => setLookup({ cep: digits, info }))
      .catch(() => {
        // ViaCEP is a convenience only (or the request was aborted); the quote still works without it.
      });
    return () => controller.abort();
  }, [digits]);

  const info = lookup?.cep === digits ? lookup.info : null;
  const showError = Boolean(fieldState.error) && (fieldState.isTouched || digits.length === 8);

  return (
    <div>
      <label htmlFor="destinationCep" className="mb-1 block text-sm font-medium">
        CEP de destino
      </label>
      <input
        ref={ref}
        id="destinationCep"
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        maxLength={9}
        readOnly={readOnly}
        value={value ?? ""}
        onChange={(event) => onChange(formatCep(event.target.value))}
        onBlur={onBlur}
        aria-invalid={showError}
        aria-describedby="destinationCep-hint"
        className={`field text-lg tracking-wide ${showError ? "field-error" : ""} ${readOnly ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
      />
      <p id="destinationCep-hint" className="mt-1.5 min-h-5 text-sm" aria-live="polite">
        {showError ? (
          <span className="text-red-600 dark:text-red-400">{fieldState.error?.message}</span>
        ) : info ? (
          <span className="text-zinc-600 dark:text-zinc-400">
            {info.city} / {info.state}
          </span>
        ) : null}
      </p>
    </div>
  );
}
