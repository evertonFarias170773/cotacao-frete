"use client";

import { LogOut, Package } from "lucide-react";
import Link from "next/link";

async function logout() {
  await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
  // Full reload on purpose: drops every piece of client state from the session that just ended.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/entrar");
}

/** Top bar shared by the quote and shipments pages. */
export function AppHeader({ current }: { current: "cotar" | "envios" }) {
  const tab = (active: boolean) =>
    `inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium transition ${
      active
        ? "bg-accent-soft text-accent-fg"
        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;
  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Navegação principal">
      <div className="flex gap-1">
        <Link href="/" className={tab(current === "cotar")} aria-current={current === "cotar" ? "page" : undefined}>
          Cotar
        </Link>
        <Link href="/envios" className={tab(current === "envios")} aria-current={current === "envios" ? "page" : undefined}>
          <Package className="mr-1.5 h-4 w-4" aria-hidden />
          Envios
        </Link>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Sair
      </button>
    </nav>
  );
}
