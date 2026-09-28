"use client";

import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/format";

export type ShipmentSummary = {
  id: string;
  protocol: string;
  status: string;
  service: string;
  price: number;
  recipient: string;
  destination: string;
  tracking: string | null;
  createdAt: string;
  paid: boolean;
  generated: boolean;
  fromApp: boolean;
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando pagamento",
  released: "Paga",
  generated: "Etiqueta gerada",
  received: "Recebido",
  posted: "Postado",
  delivered: "Entregue",
  canceled: "Cancelado",
  undelivered: "Não entregue",
  paused: "Pausado",
  suspended: "Suspenso",
};

const STATUS_TONES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  canceled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  undelivered: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

/** "2026-09-28 19:37:36" -> "28/09 19:37" */
function shortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]} ${match[4]}:${match[5]}` : value;
}

export function ShipmentRow({ shipment, children }: { shipment: ShipmentSummary; children?: ReactNode }) {
  const tone = STATUS_TONES[shipment.status] ?? "bg-accent-soft text-accent-fg";
  return (
    <li className="card space-y-2 p-4 text-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{shipment.service || "Serviço"}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
              {STATUS_LABELS[shipment.status] ?? shipment.status}
            </span>
            {shipment.fromApp && (
              <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700">
                pelo app
              </span>
            )}
          </div>
          <p className="truncate text-zinc-600 dark:text-zinc-300">
            {shipment.recipient}
            {shipment.destination ? ` · ${shipment.destination}` : ""}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {shortDate(shipment.createdAt)}
            {shipment.protocol ? ` · ${shipment.protocol}` : ""}
            {shipment.tracking ? ` · rastreio ${shipment.tracking}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-base font-bold tabular-nums">{formatCurrency(shipment.price)}</p>
      </div>
      {children}
    </li>
  );
}
