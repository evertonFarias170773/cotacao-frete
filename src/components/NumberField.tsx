"use client";

import type { ComponentProps } from "react";

type Props = ComponentProps<"input"> & {
  id: string;
  label: string;
  error?: string;
  prefix?: string;
  suffix?: string;
};

/** Text input for numbers (so "0,3" is accepted) with a unit shown inside the field. */
export function NumberField({ id, label, error, prefix, suffix, className = "", ...rest }: Props) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`field ${prefix ? "pl-9" : ""} ${suffix ? "pr-9" : ""} ${error ? "field-error" : ""} ${className}`}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-500">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
