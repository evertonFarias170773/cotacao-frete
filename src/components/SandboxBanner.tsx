import { FlaskConical } from "lucide-react";

/**
 * Server-rendered notice while the app talks to the Melhor Envio sandbox: purchases there use fake
 * money, and label generation stays pending forever (seen on every sandbox order, Sept 2026).
 */
export function SandboxBanner() {
  if (process.env.MELHOR_ENVIO_ENV?.trim() !== "sandbox") return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-violet-100 px-4 py-2 text-center text-sm font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-100"
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
      Ambiente de testes (sandbox do Melhor Envio): compras com saldo fictício, e as etiquetas ficam pendentes sem gerar.
    </div>
  );
}
