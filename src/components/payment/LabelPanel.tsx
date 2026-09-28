"use client";

import { CheckCircle2, Loader2, Printer, RotateCw, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { callApi } from "@/lib/apiClient";

type GenerateResult = { id: string; ok: boolean; message: string };
type LabelStatus = { id: string; status: string; generated: boolean; tracking: string | null };

const POLL_MS = 4000;
const GIVE_UP_MS = 2 * 60 * 1000;

/**
 * Sends paid orders for label generation once, then follows each label until it is ready.
 * One label per order: carriers such as Correios take one volume per label.
 */
export function LabelPanel({ orders }: { orders: string[] }) {
  const [results, setResults] = useState<Record<string, GenerateResult>>({});
  const [labels, setLabels] = useState<Record<string, LabelStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  // Guards the one-off generation against the double effect run of React's development mode.
  const started = useRef(false);

  async function generate(ids: string[]) {
    try {
      const { results: list } = await callApi<{ results: GenerateResult[] }>("/api/shipments/labels", {
        method: "POST",
        body: { orders: ids },
      });
      setResults((current) => ({ ...current, ...Object.fromEntries(list.map((r) => [r.id, r])) }));
      setTimedOut(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar a etiqueta.");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate(orders);
  }, [orders]);

  // Follows the labels sent for generation until each is ready, for up to two minutes.
  const waiting = orders.filter((id) => results[id]?.ok && !labels[id]?.generated);
  const waitingKey = waiting.join(",");
  useEffect(() => {
    if (!waitingKey) return;
    let active = true;
    const deadline = Date.now() + GIVE_UP_MS;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const { labels: list } = await callApi<{ labels: LabelStatus[] }>(`/api/shipments/labels?orders=${waitingKey}`);
        if (!active) return;
        setLabels((current) => ({ ...current, ...Object.fromEntries(list.map((l) => [l.id, l])) }));
        if (list.every((l) => l.generated)) return;
      } catch {
        // Retried on the next tick.
      }
      if (!active) return;
      if (Date.now() > deadline) setTimedOut(true);
      else timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [waitingKey]);

  async function retry(id: string) {
    setRetrying(id);
    await generate([id]);
    setRetrying(null);
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
        Pagamento concluído.
      </p>
      <ul className="space-y-2">
        {orders.map((id, index) => {
          const result = results[id];
          const label = labels[id];
          return (
            <li key={id} className="card space-y-2 p-3 text-sm" data-order={id}>
              <p className="font-medium">{orders.length === 1 ? "Etiqueta" : `Etiqueta ${index + 1} de ${orders.length}`}</p>
              {label?.generated ? (
                <>
                  <p className="text-zinc-600 dark:text-zinc-300">
                    Pronta{label.tracking ? ` · rastreio ${label.tracking}` : ""}
                  </p>
                  <a
                    href={`/api/shipments/labels/print?order=${id}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white transition hover:brightness-110"
                  >
                    <Printer className="h-4 w-4" aria-hidden />
                    Imprimir etiqueta
                  </a>
                </>
              ) : result && !result.ok ? (
                <>
                  <p className="flex items-start gap-1.5 text-red-700 dark:text-red-300">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {result.message || "A transportadora recusou a geração."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void retry(id)}
                    disabled={retrying === id}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    {retrying === id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />}
                    Tentar de novo
                  </button>
                </>
              ) : timedOut ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  A transportadora ainda está processando. A etiqueta aparece na tela Envios quando ficar pronta.
                </p>
              ) : (
                <p className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Gerando a etiqueta…
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
