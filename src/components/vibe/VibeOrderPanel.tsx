"use client";

import { FileCode2, PackageSearch, X } from "lucide-react";
import { useState } from "react";
import { callApi } from "@/lib/apiClient";
import { formatCep, formatKg, onlyDigits } from "@/lib/format";
import { MAX_NFE_XML_BYTES, NfeXmlError, parseNfeXml } from "@/lib/nfeXml";
import { compareNfeWithVibe, type LoadedNfe, type VibeOrder, type VibeSelection } from "@/lib/vibe";

type Props = {
  selection: VibeSelection | null;
  disabled: boolean;
  onLoad: (order: VibeOrder) => void;
  onInvoice: (invoice: LoadedNfe) => void;
  onClear: () => void;
};

const PRIMARY =
  "inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-300 px-3 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** Fills the quote (and later the label) from a Vibe order number, with an optional NF-e XML. */
export function VibeOrderPanel({ selection, disabled, onLoad, onInvoice, onClear }: Props) {
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function search() {
    const digits = onlyDigits(number);
    if (!digits) {
      setError("Informe o número do pedido.");
      return;
    }
    setBusy(true);
    setError(null);
    setFileError(null);
    try {
      const { order } = await callApi<{ order: VibeOrder }>(`/api/vibe/orders/${digits}`);
      onLoad(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível falar com o Vibe agora.");
    } finally {
      setBusy(false);
    }
  }

  async function readXml(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_NFE_XML_BYTES) {
      setFileError("Arquivo grande demais para um XML de NF-e.");
      return;
    }
    try {
      const xml = await file.text();
      onInvoice({ nfe: parseNfeXml(xml), xml });
    } catch (err) {
      setFileError(err instanceof NfeXmlError ? err.message : "Não foi possível ler o arquivo.");
    }
  }

  const order = selection?.order;
  const invoice = selection?.invoice;
  const boxes = order?.boxes.reduce((total, box) => total + box.quantity, 0) ?? 0;
  const warnings = order && invoice ? compareNfeWithVibe(invoice.nfe, order) : [];

  return (
    <section className="card space-y-3 p-4" aria-labelledby="vibe-title">
      <h2 id="vibe-title" className="flex items-center gap-2 text-base font-semibold">
        <PackageSearch className="h-5 w-5 text-accent-fg" aria-hidden />
        Pedido do Vibe
      </h2>

      {!order && (
        <>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Para ir direto à etiqueta: o pedido preenche a cotação.</p>
          <div className="flex gap-2">
            <label htmlFor="vibe-order" className="sr-only">
              Número do pedido no Vibe
            </label>
            <input
              id="vibe-order"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Nº do pedido"
              value={number}
              onChange={(event) => setNumber(onlyDigits(event.target.value).slice(0, 9))}
              onKeyDown={(event) => {
                // The field sits inside the quote form: Enter searches the order instead of quoting.
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
              disabled={busy || disabled}
              className="field flex-1"
            />
            <button type="button" onClick={() => void search()} disabled={busy || disabled} className={PRIMARY}>
              {busy ? "Buscando…" : "Buscar"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </>
      )}

      {order && (
        <>
          <div className="space-y-0.5 text-sm" data-testid="vibe-summary">
            <p className="font-semibold">
              Pedido {order.id} · {order.recipient.name}
            </p>
            <p className="text-zinc-600 dark:text-zinc-300">
              {order.recipient.city}/{order.recipient.stateAbbr} · CEP {formatCep(order.postalCode)}
            </p>
            <p className="text-zinc-600 dark:text-zinc-300">
              {formatKg(order.totalWeight)} em {boxes} {boxes === 1 ? "caixa" : "caixas"}
            </p>
          </div>

          {invoice && (
            <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-fg">
              NF-e nº {invoice.nfe.number} anexada: o CEP e o destinatário vêm da nota.
            </p>
          )}
          {warnings.map((warning) => (
            <p key={warning} className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {warning}
            </p>
          ))}
          {fileError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {fileError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <label htmlFor="vibe-xml" className={`${SECONDARY} cursor-pointer`}>
              <FileCode2 className="h-4 w-4" aria-hidden />
              {invoice ? "Trocar XML" : "Anexar XML"}
            </label>
            <input
              id="vibe-xml"
              type="file"
              accept=".xml,text/xml,application/xml"
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                void readXml(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => {
                setNumber("");
                setError(null);
                setFileError(null);
                onClear();
              }}
              disabled={disabled}
              className={SECONDARY}
            >
              <X className="h-4 w-4" aria-hidden />
              Limpar
            </button>
          </div>
        </>
      )}
    </section>
  );
}
