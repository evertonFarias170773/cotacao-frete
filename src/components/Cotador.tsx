"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eraser, Plus, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { useHydrated } from "@/hooks/useHydrated";
import { useOnline } from "@/hooks/useOnline";
import { formatCep } from "@/lib/format";
import type { PlannedVolume } from "@/lib/presets";
import { requestQuote } from "@/lib/quoteClient";
import {
  quoteFormSchema,
  type QuoteRequest,
  type QuoteFormInput,
  type QuoteFormOutput,
  type VolumeFormInput,
} from "@/lib/schemas";
import { formSignature, requestSignature } from "@/lib/signature";
import {
  createHistoryEntry,
  loadHistory,
  loadLastOrigin,
  pushHistory,
  saveLastOrigin,
  type HistoryEntry,
} from "@/lib/storage";
import type { QuoteOption, QuoteResult } from "@/lib/types";
import { AppHeader } from "./AppHeader";
import { ContractDialog } from "./contract/ContractDialog";
import { PendingPaymentBanner } from "./payment/PendingPaymentBanner";
import { DestinationInput } from "./DestinationInput";
import { HistoryList } from "./HistoryList";
import { OriginSelector } from "./OriginSelector";
import { PresetShortcuts } from "./PresetShortcuts";
import { QuoteButton } from "./QuoteButton";
import { ResultsList, type QuoteStatus } from "./ResultsList";
import { VolumeCard } from "./VolumeCard";
import { VolumesSummary } from "./VolumesSummary";

const RESULTS_ID = "resultados";
/** Espera o usuário parar de digitar antes de refazer a cotação sozinho. */
const RECALC_DELAY_MS = 600;

const emptyVolume = (): VolumeFormInput => ({
  height: "",
  width: "",
  length: "",
  weight: "",
  insurance: "",
  quantity: "1",
});

const toFormText = (value: number) => String(value).replace(".", ",");

/** On small screens the results sit below the form; bring them into view after quoting. */
function revealResults() {
  if (window.matchMedia("(max-width: 1023px)").matches) {
    document
      .getElementById(RESULTS_ID)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function Cotador({ vibeEnabled = false }: { vibeEnabled?: boolean }) {
  const form = useForm<QuoteFormInput, unknown, QuoteFormOutput>({
    resolver: zodResolver(quoteFormSchema),
    mode: "onChange",
    defaultValues: {
      destinationCep: "",
      volumes: [emptyVolume()],
      options: { receipt: false, own_hand: false },
    },
  });
  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    reset,
    trigger,
    formState: { isValid },
  } = form;
  const volumes = useFieldArray({ control, name: "volumes" });

  const hydrated = useHydrated();
  const online = useOnline();
  // Every quote carries the fingerprint of the data it was calculated from.
  const [quote, setQuote] = useState<{
    signature: string;
    result: QuoteResult;
    request: QuoteRequest;
  } | null>(null);
  // The option being contracted; only ever one of the options of the quote on screen.
  const [contracting, setContracting] = useState<QuoteOption | null>(null);
  const [failure, setFailure] = useState<{
    signature: string;
    message: string;
  } | null>(null);
  const [inFlight, setInFlight] = useState(false);
  // Read on the client only; rendered only after hydration to avoid a markup mismatch.
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  const signature = formSignature(useWatch({ control }));
  const result = quote?.signature === signature ? quote.result : null;
  const error = failure?.signature === signature ? failure.message : null;
  // Something that changes the price was edited: the list on screen no longer matches the form.
  const outdated =
    (quote !== null || failure !== null) && result === null && error === null;
  const recalculating = outdated && !inFlight && isValid && online;
  const status: QuoteStatus =
    inFlight || recalculating
      ? "loading"
      : error
        ? "error"
        : result
          ? "success"
          : "idle";

  // The remembered origin lives in localStorage, so it can only be applied after mount.
  useEffect(() => {
    const lastOrigin = loadLastOrigin();
    if (lastOrigin) setValue("originId", lastOrigin, { shouldValidate: true });
  }, [setValue]);

  const submit = handleSubmit(
    async (data) => {
      const quoted = requestSignature(data);
      saveLastOrigin(data.originId);
      try {
        const fresh = await requestQuote(data);
        setFailure(null);
        setQuote({ signature: quoted, result: fresh, request: data });
        const best = fresh.available[0];
        if (best) setHistory(pushHistory(createHistoryEntry(data, best)));
      } catch (err) {
        setQuote(null);
        setFailure({
          signature: quoted,
          message:
            err instanceof Error
              ? err.message
              : "Não foi possível cotar. Tente novamente.",
        });
      } finally {
        setInFlight(false);
      }
    },
    () => setInFlight(false),
  );

  /** Single entry point for every quote, so only one request runs at a time. */
  function startQuote({ reveal = true } = {}) {
    setInFlight(true);
    void submit().then(() => {
      // An automatic recalculation must not yank the user away from the field being edited.
      if (reveal) revealResults();
    });
  }

  // The effect below needs the latest closure without re-running on every render.
  const startQuoteRef = useRef(startQuote);
  useEffect(() => {
    startQuoteRef.current = startQuote;
  });

  // Inputs changed after a quote: recalculate once the user stops editing.
  useEffect(() => {
    if (!recalculating) return;
    const timer = setTimeout(
      () => startQuoteRef.current({ reveal: false }),
      RECALC_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [recalculating, signature]);

  function newQuote() {
    reset({
      originId: getValues("originId"),
      destinationCep: "",
      volumes: [emptyVolume()],
      options: { receipt: false, own_hand: false },
    });
    setQuote(null);
    setFailure(null);
  }

  function repeat(entry: HistoryEntry) {
    reset({
      originId: entry.originId,
      destinationCep: formatCep(entry.destinationCep),
      volumes: entry.volumes.map((v) => ({
        height: toFormText(v.height),
        width: toFormText(v.width),
        length: toFormText(v.length),
        weight: toFormText(v.weight),
        insurance: toFormText(v.insurance),
        quantity: String(v.quantity),
      })),
      options: entry.options,
    });
    startQuote();
  }

  function duplicateVolume(index: number) {
    volumes.insert(index + 1, { ...getValues(`volumes.${index}`) });
  }

  /** Replaces the volume list with the packages a product preset generated. */
  function applyPreset(plan: PlannedVolume[]) {
    volumes.replace(
      plan.map((volume) => ({
        height: toFormText(volume.height),
        width: toFormText(volume.width),
        length: toFormText(volume.length),
        weight: toFormText(volume.weight),
        insurance: toFormText(volume.insurance),
        quantity: String(volume.quantity),
      })),
    );
    void trigger("volumes");
  }

  const loading = status === "loading";

  return (
    <FormProvider {...form}>
      <main className="mx-auto w-full max-w-6xl px-4 pb-40 pt-6 sm:px-6 lg:grid lg:grid-cols-2 lg:gap-10 lg:pb-12">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            startQuote();
          }}
          noValidate
          className="space-y-8"
        >
          <header className="space-y-4">
            <AppHeader current="cotar" />
            <PendingPaymentBanner />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Cotador de Fretes
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Escolha a origem, informe o destino e os volumes para comparar
                as transportadoras.
              </p>
            </div>
          </header>

          <section>
            <SectionTitle step={1}>De onde sai?</SectionTitle>
            <OriginSelector />
          </section>

          <section>
            <SectionTitle step={2}>Para onde vai?</SectionTitle>
            <DestinationInput />
          </section>

          <section>
            <SectionTitle step={3}>Volumes</SectionTitle>
            <PresetShortcuts onApply={applyPreset} />
            <div className="space-y-3">
              {volumes.fields.map((field, index) => (
                <VolumeCard
                  key={field.id}
                  index={index}
                  canRemove={volumes.fields.length > 1}
                  onDuplicate={() => duplicateVolume(index)}
                  onRemove={() => volumes.remove(index)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => volumes.append(emptyVolume())}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 text-sm font-medium text-zinc-700 transition hover:border-accent hover:text-accent-fg dark:border-zinc-700 dark:text-zinc-300"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Adicionar volume
            </button>
          </section>

          <details className="card">
            <summary className="cursor-pointer list-none px-4 py-3 font-medium">
              Opções adicionais
            </summary>
            <div className="space-y-1 border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded accent-accent"
                  {...register("options.receipt")}
                />
                Aviso de recebimento
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded accent-accent"
                  {...register("options.own_hand")}
                />
                Mãos próprias
              </label>
            </div>
          </details>

          {hydrated && (
            <HistoryList
              entries={history}
              onRepeat={repeat}
              disabled={loading}
            />
          )}

          <div
            className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-surface/95 px-4 pt-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none dark:border-zinc-800"
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className="mx-auto max-w-6xl space-y-2 lg:max-w-none lg:space-y-3">
              <VolumesSummary />
              <QuoteButton loading={loading} disabled={!isValid || !online} />
            </div>
          </div>
        </form>

        <aside
          id={RESULTS_ID}
          className="mt-10 scroll-mt-4 lg:mt-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Resultados</h2>
            {(status === "success" || status === "error") && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startQuote()}
                  disabled={loading || !online}
                  className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <RotateCw className="h-4 w-4" aria-hidden />
                  Refazer
                </button>
                <button
                  type="button"
                  onClick={newQuote}
                  className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Eraser className="h-4 w-4" aria-hidden />
                  Nova cotação
                </button>
              </div>
            )}
          </div>
          <ResultsList
            status={status}
            result={result}
            error={error}
            onRetry={() => startQuote()}
            onContract={status === "success" ? setContracting : undefined}
          />
        </aside>
      </main>
      {contracting && quote && result && (
        <ContractDialog
          option={contracting}
          quote={quote.request}
          onClose={() => setContracting(null)}
        />
      )}
    </FormProvider>
  );
}

function SectionTitle({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-fg">
        {step}
      </span>
      {children}
    </h2>
  );
}
