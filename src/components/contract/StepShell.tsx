"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/** Body of one step plus its footer buttons, laid out the same way in every step. */
export function StepShell({
  children,
  error,
  back,
  next,
}: {
  children: ReactNode;
  error?: string | null;
  back?: { label: string; onClick: () => void; disabled?: boolean };
  next?: { label: string; onClick?: () => void; disabled?: boolean; busy?: boolean; type?: "button" | "submit" };
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {children}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
      </div>
      {(back || next) && (
        <div
          className="flex gap-3 border-t border-zinc-100 px-5 pt-3 dark:border-zinc-800"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              disabled={back.disabled}
              className="h-12 rounded-xl border border-zinc-300 px-4 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {back.label}
            </button>
          )}
          {next && (
            <button
              type={next.type ?? "button"}
              onClick={next.onClick}
              disabled={next.disabled || next.busy}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {next.busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
              {next.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Small labelled text input used by the contract steps. */
export function Field({
  id,
  label,
  error,
  className = "",
  ...input
}: React.ComponentProps<"input"> & { id: string; label: string; error?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`field ${error ? "field-error" : ""}`}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </p>
  );
}
