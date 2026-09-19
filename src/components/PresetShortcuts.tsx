"use client";

import { ChevronDown, Zap } from "lucide-react";
import { useState } from "react";
import { PRODUCT_PRESETS, type ProductPreset } from "@/config/products";
import { formatCurrency, formatKg, formatNumber, onlyDigits } from "@/lib/format";
import { MAX_PRESET_UNITS, planPresetVolumes, summarizePlan, type PlannedVolume } from "@/lib/presets";

type Props = { onApply: (plan: PlannedVolume[]) => void };

export function PresetShortcuts({ onApply }: Props) {
  return (
    <div className="mb-3 space-y-2">
      {PRODUCT_PRESETS.map((preset) => (
        <PresetCard key={preset.id} preset={preset} onApply={onApply} />
      ))}
    </div>
  );
}

function PresetCard({ preset, onApply }: { preset: ProductPreset; onApply: Props["onApply"] }) {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState("");

  const plan = planPresetVolumes(preset, Number(units || "0"));
  const totals = summarizePlan(plan);
  const invalid = units !== "" && plan.length === 0;
  const inputId = `preset-${preset.id}-units`;

  function apply() {
    if (plan.length === 0) return;
    onApply(plan);
    setOpen(false);
  }

  return (
    <section className="card border-dashed">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={`preset-${preset.id}-panel`}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Zap className="h-5 w-5 shrink-0 text-accent" aria-hidden />
        <span className="flex-1 font-medium">Cotar {preset.name}</span>
        <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">
          só a quantidade
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={`preset-${preset.id}-panel`}
          className="space-y-3 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800"
        >
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Quantidade de {preset.name}
              </label>
              <div className="relative">
                <input
                  id={inputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  maxLength={3}
                  value={units}
                  onChange={(event) => setUnits(onlyDigits(event.target.value))}
                  onKeyDown={(event) => {
                    // Enter inside the quote form would submit it; apply the preset instead.
                    if (event.key === "Enter") {
                      event.preventDefault();
                      apply();
                    }
                  }}
                  aria-invalid={invalid}
                  aria-describedby={`${inputId}-hint`}
                  className={`field pr-10 ${invalid ? "field-error" : ""}`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-500">
                  un.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={apply}
              disabled={plan.length === 0}
              className="h-11 shrink-0 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
            >
              Preencher
            </button>
          </div>

          <div id={`${inputId}-hint`} className="text-sm" aria-live="polite">
            {invalid ? (
              <p className="text-red-600 dark:text-red-400">
                Informe um número inteiro de 1 a {MAX_PRESET_UNITS}.
              </p>
            ) : plan.length > 0 ? (
              <div className="space-y-1 text-zinc-600 dark:text-zinc-400">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {totals.volumes === 1 ? "1 volume" : `${totals.volumes} volumes`} ·{" "}
                  {formatKg(totals.weight)} · {formatCurrency(totals.value)} declarados
                </p>
                <ul className="space-y-0.5">
                  {plan.map((volume) => (
                    <li key={volume.unitsPerVolume}>
                      {volume.quantity}× {formatNumber(volume.width)} × {formatNumber(volume.length)} ×{" "}
                      {formatNumber(volume.height)} cm (L × C × A) · {volume.unitsPerVolume} un. ·{" "}
                      {formatKg(volume.weight)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400">
                Até {preset.maxPerVolume} {preset.name} por volume. Acima disso o app divide em volumes iguais.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
