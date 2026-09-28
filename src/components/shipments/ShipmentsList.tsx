"use client";

import { ChevronLeft, ChevronRight, Loader2, Printer, RotateCw, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { callApi } from "@/lib/apiClient";
import { formatCurrency } from "@/lib/format";
import { loadPendingPayment, type PendingPayment } from "@/lib/storage";
import { LabelPanel } from "../payment/LabelPanel";
import { PaymentPanel } from "../payment/PaymentPanel";
import { ShipmentRow, type ShipmentSummary } from "./ShipmentRow";

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "released", label: "Pagos" },
  { value: "generated", label: "Etiqueta gerada" },
  { value: "posted", label: "Postados" },
  { value: "delivered", label: "Entregues" },
  { value: "canceled", label: "Cancelados" },
];

/** Paid labels the carrier has not received yet can still be cancelled. */
const CANCELLABLE = new Set(["released", "generated"]);

type Page = { items: ShipmentSummary[]; page: number; lastPage: number; total: number };
type Action = { kind: "pay" | "label"; id: string } | null;

const actionButton =
  "inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function ShipmentsList() {
  const hydrated = useHydrated();
  const [pending, setPending] = useState<PendingPayment | null>(() =>
    typeof window === "undefined" ? null : loadPendingPayment(),
  );
  const [pendingPaid, setPendingPaid] = useState(false);

  const [cart, setCart] = useState<ShipmentSummary[] | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<Set<string>>(() => new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let active = true;
    callApi<{ items: ShipmentSummary[] }>("/api/shipments?view=cart")
      .then(({ items }) => active && setCart(items))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : "Não foi possível ler o carrinho."));
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    const query = `page=${page}${status ? `&status=${status}` : ""}`;
    callApi<Page>(`/api/shipments?${query}`)
      .then((data) => active && setList(data))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : "Não foi possível listar os envios."));
    return () => {
      active = false;
    };
  }, [page, status, reloadKey]);

  async function cancel(item: ShipmentSummary) {
    const question = `Cancelar a etiqueta de ${formatCurrency(item.price)}? O valor volta para a carteira em até 12 horas.`;
    if (!window.confirm(question)) return;
    setCancelling(item.id);
    setError(null);
    try {
      await callApi(`/api/shipments/${item.id}/cancel`, { method: "POST" });
      setCancelled((current) => new Set(current).add(item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cancelar.");
    } finally {
      setCancelling(null);
    }
  }

  async function removeFromCart(id: string) {
    setRemoving(id);
    try {
      await callApi("/api/shipments/cart", { method: "DELETE", body: { orders: [id] } });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover.");
    } finally {
      setRemoving(null);
    }
  }

  // Cart items that belong to a resumed PIX are shown in that section only.
  const pendingIds = new Set(pending && !pendingPaid ? pending.orders : []);
  const waiting = (cart ?? []).filter((item) => !pendingIds.has(item.id));

  return (
    <div className="space-y-8">
      {hydrated && pending && (
        <section id="pagamento-pendente" className="space-y-3">
          <h2 className="text-lg font-semibold">Pagamento pendente</h2>
          <div className="card space-y-4 p-4">
            <p className="text-sm font-medium">{pending.label}</p>
            {pendingPaid ? (
              <LabelPanel orders={pending.orders} />
            ) : (
              <PaymentPanel
                orders={pending.orders}
                total={pending.total}
                label={pending.label}
                onDiscard={() => setPending(null)}
                onPaid={() => {
                  setPendingPaid(true);
                  reload();
                }}
              />
            )}
            {pendingPaid && (
              <button type="button" className={actionButton} onClick={() => setPending(null)}>
                Fechar
              </button>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Aguardando pagamento</h2>
        {cart === null ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lendo o carrinho…
          </p>
        ) : waiting.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nada aguardando pagamento.</p>
        ) : (
          <ul className="space-y-3">
            {waiting.map((item) => (
              <ShipmentRow key={item.id} shipment={item}>
                {action?.kind === "pay" && action.id === item.id ? (
                  <PaymentPanel
                    orders={[item.id]}
                    total={item.price}
                    label={`${item.service} para ${item.recipient}`}
                    onPaid={() => setAction({ kind: "label", id: item.id })}
                  />
                ) : action?.kind === "label" && action.id === item.id ? (
                  <LabelPanel orders={[item.id]} />
                ) : (
                  <div className="flex gap-2">
                    <button type="button" className={actionButton} onClick={() => setAction({ kind: "pay", id: item.id })}>
                      Pagar
                    </button>
                    <button
                      type="button"
                      className={actionButton}
                      onClick={() => void removeFromCart(item.id)}
                      disabled={removing === item.id}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Remover
                    </button>
                  </div>
                )}
              </ShipmentRow>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Envios da conta</h2>
          <button type="button" className={actionButton} onClick={reload}>
            <RotateCw className="h-4 w-4" aria-hidden /> Atualizar
          </button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
                setList(null);
              }}
              className={`h-9 rounded-full px-3 text-sm font-medium transition ${
                status === filter.value
                  ? "bg-accent text-white"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {list === null ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando envios…
          </p>
        ) : list.items.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum envio com esse filtro.</p>
        ) : (
          <ul className="space-y-3">
            {list.items.map((item) => (
              <ShipmentRow key={item.id} shipment={item}>
                {action?.kind === "label" && action.id === item.id ? (
                  <LabelPanel orders={[item.id]} />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {item.generated && item.status !== "canceled" ? (
                      <a href={`/api/shipments/labels/print?order=${item.id}`} target="_blank" rel="noopener" className={actionButton}>
                        <Printer className="h-4 w-4" aria-hidden /> Imprimir
                      </a>
                    ) : item.paid && item.status === "released" ? (
                      <button type="button" className={actionButton} onClick={() => setAction({ kind: "label", id: item.id })}>
                        Gerar etiqueta
                      </button>
                    ) : null}
                    {CANCELLABLE.has(item.status) && (
                      <button
                        type="button"
                        className={actionButton}
                        onClick={() => void cancel(item)}
                        disabled={cancelling === item.id}
                      >
                        {cancelling === item.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
                {cancelled.has(item.id) && (
                  <p className="text-xs text-green-700 dark:text-green-400">
                    Cancelamento pedido. O valor volta para a carteira em até 12 horas.
                  </p>
                )}
              </ShipmentRow>
            ))}
          </ul>
        )}

        {list && list.lastPage > 1 && (
          <nav className="flex items-center justify-between text-sm" aria-label="Páginas">
            <button
              type="button"
              className={actionButton}
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => p - 1);
                setList(null);
              }}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
            </button>
            <span className="text-zinc-500 dark:text-zinc-400">
              Página {list.page} de {list.lastPage} · {list.total} envios
            </span>
            <button
              type="button"
              className={actionButton}
              disabled={page >= list.lastPage}
              onClick={() => {
                setPage((p) => p + 1);
                setList(null);
              }}
            >
              Próxima <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </nav>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
