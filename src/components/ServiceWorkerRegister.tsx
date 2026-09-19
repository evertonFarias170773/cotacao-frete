"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds only, so dev never serves stale HTML from cache. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Installation is a progressive enhancement; the app works without it.
      });
  }, []);
  return null;
}
