"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
    >
      <WifiOff className="h-4 w-4" aria-hidden />
      Você está offline. A cotação precisa de internet.
    </div>
  );
}
