"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDeliveryRange, formatKg } from "@/lib/format";
import type { QuoteOption } from "@/lib/types";

type Props = {
  option: QuoteOption;
  badge?: "cheapest" | "fastest";
  highlight?: boolean;
};

export function ResultItem({ option, badge, highlight }: Props) {
  const [open, setOpen] = useState(false);
  const detailsId = `result-${option.id}-details`;
  const originalPrice = option.originalPrice;
  const hasDiscount = originalPrice !== undefined && originalPrice > option.price;

  return (
    <li className={`card overflow-hidden ${highlight ? "border-accent ring-1 ring-accent" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailsId}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Logo option={option} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{option.service}</span>
            {badge === "cheapest" && <Badge tone="accent">Mais barato</Badge>}
            {badge === "fastest" && <Badge tone="green">Mais rápido</Badge>}
          </div>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {option.company ? `${option.company} · ` : ""}
            {formatDeliveryRange(option.deliveryMin, option.deliveryMax)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums">{formatCurrency(option.price)}</p>
          {hasDiscount && (
            <p className="text-xs text-zinc-400 line-through tabular-nums">{formatCurrency(originalPrice)}</p>
          )}
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={detailsId}
          className="space-y-2 border-t border-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
        >
          {hasDiscount ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
              <dt>Preço original</dt>
              <dd className="text-right line-through">{formatCurrency(originalPrice)}</dd>
              <dt>Preço com desconto</dt>
              <dd className="text-right font-semibold text-zinc-900 dark:text-zinc-100">
                {formatCurrency(option.price)}
              </dd>
              <dt>Economia</dt>
              <dd className="text-right text-green-700 dark:text-green-400">
                {formatCurrency(originalPrice - option.price)}
              </dd>
            </dl>
          ) : (
            <p>Preço: {formatCurrency(option.price)}</p>
          )}
          <p>Prazo: {formatDeliveryRange(option.deliveryMin, option.deliveryMax)}</p>
          {option.packages && option.packages.length > 0 && (
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {option.packages.length === 1 ? "1 pacote" : `${option.packages.length} pacotes`}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {option.packages.map((pkg, index) => (
                  <li key={index}>{describePackage(pkg, index)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Logo({ option }: { option: QuoteOption }) {
  if (option.logoUrl) {
    return (
      // Carrier logos come from Melhor Envio's CDN; a plain <img> avoids next/image remote config.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={option.logoUrl}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-0.5"
      />
    );
  }
  const initials = option.company
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
    >
      {initials || "?"}
    </span>
  );
}

function Badge({ tone, children }: { tone: "accent" | "green"; children: React.ReactNode }) {
  const toneClass =
    tone === "accent"
      ? "bg-accent text-white"
      : "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${toneClass}`}>{children}</span>;
}

type PackageLike = {
  dimensions?: { height?: number | string; width?: number | string; length?: number | string };
  weight?: number | string;
  price?: number | string;
};

/** Human summary of a package entry from the API; falls back gracefully for unknown shapes. */
function describePackage(pkg: unknown, index: number): string {
  const label = `Pacote ${index + 1}`;
  if (!pkg || typeof pkg !== "object") return label;
  const { dimensions, weight, price } = pkg as PackageLike;
  const parts = [label];
  if (dimensions && (dimensions.height ?? dimensions.width ?? dimensions.length) !== undefined) {
    parts.push(`${dimensions.height ?? "?"} × ${dimensions.width ?? "?"} × ${dimensions.length ?? "?"} cm`);
  }
  const weightNumber = Number(weight);
  if (weight !== undefined && weight !== "" && Number.isFinite(weightNumber)) parts.push(formatKg(weightNumber));
  const priceNumber = Number(price);
  if (price !== undefined && price !== "" && Number.isFinite(priceNumber)) parts.push(formatCurrency(priceNumber));
  return parts.join(" · ");
}
