import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { ShipmentsList } from "@/components/shipments/ShipmentsList";

export const metadata: Metadata = { title: "Envios · Cotador de Fretes" };

export default function ShipmentsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-6 sm:px-6">
      <AppHeader current="envios" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Envios</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Envios da conta do Melhor Envio: pague o que ficou pendente, gere e imprima etiquetas.
        </p>
      </div>
      <ShipmentsList />
    </main>
  );
}
