"use client";

import { FileCode2, FileText, Receipt, Upload } from "lucide-react";
import { useState } from "react";
import { formatCep, formatCurrency } from "@/lib/format";
import { compareNfeWithQuote } from "@/lib/nfeChecks";
import { MAX_NFE_XML_BYTES, NfeXmlError, parseNfeXml, type NfeData } from "@/lib/nfeXml";
import { contentSchema, recipientFromNfe, type RecipientInput } from "@/lib/recipient";
import { compareNfeWithVibe, type LoadedNfe, type VibeOrder } from "@/lib/vibe";
import {
  DECLARATION_INSURANCE_LIMIT,
  DEFAULT_DESCRIPTION,
  type ContentDraft,
  type DocumentSource,
  type NfeSummary,
} from "./types";
import { Field, StepShell } from "./StepShell";

export type DocumentResult = {
  source: DocumentSource;
  content: ContentDraft;
  nfe?: NfeSummary;
  /** Present when an XML filled the recipient. */
  recipient?: RecipientInput;
};

type Props = {
  destinationCep: string;
  /** Carrier of the chosen service, for carrier-specific hints. */
  companyId?: number;
  declaredValue: number;
  initial: { source: DocumentSource; content: ContentDraft; nfe?: NfeSummary };
  /** Vibe order on screen: the invoice is compared with it. */
  vibe?: VibeOrder;
  /** Offered when the invoice's CEP differs from the quote: redo the quote with it. */
  onRequote?: (invoice: LoadedNfe) => void;
  onCancel: () => void;
  onNext: (result: DocumentResult) => void;
};

/** NF-e keys are easier to check in groups of four digits. */
const formatKey = (value: string) =>
  value
    .replace(/\D/g, "")
    .slice(0, 44)
    .replace(/(\d{4})(?=\d)/g, "$1 ");

type LoadedXml = { nfe: NfeData; xml: string; blocking: string | null; warnings: string[] };

/** Azul Cargo refuses commercial shipments without the NF-e XML. */
const AZUL_COMPANY_ID = 9;

export function DocumentStep(props: Props) {
  const { destinationCep, companyId, declaredValue, initial, vibe, onRequote, onCancel, onNext } = props;
  const [source, setSource] = useState<DocumentSource>(initial.source);
  const [description, setDescription] = useState(
    initial.content.kind === "declaration" ? initial.content.description : DEFAULT_DESCRIPTION,
  );
  const [key, setKey] = useState(initial.source === "key" && initial.content.kind === "invoice" ? formatKey(initial.content.key) : "");
  const [loaded, setLoaded] = useState<LoadedXml | null>(null);
  // An XML read earlier in this contract, kept when the user comes back to this step.
  const previousXml = initial.source === "xml" && initial.content.kind === "invoice" && initial.nfe ? initial : null;
  const [fileError, setFileError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function readXml(file: File | undefined) {
    setFileError(null);
    setLoaded(null);
    if (!file) return;
    if (file.size > MAX_NFE_XML_BYTES) {
      setFileError("Arquivo grande demais para um XML de NF-e.");
      return;
    }
    try {
      const xml = await file.text();
      const nfe = parseNfeXml(xml);
      const checks = compareNfeWithQuote(nfe, { destinationCep, declaredValue });
      // With a different CEP the blocking message already says it; the other differences still matter.
      const vibeWarnings = vibe && !checks.blocking ? compareNfeWithVibe(nfe, vibe) : [];
      setLoaded({ nfe, xml, blocking: checks.blocking, warnings: [...checks.warnings, ...vibeWarnings] });
    } catch (err) {
      setFileError(err instanceof NfeXmlError ? err.message : "Não foi possível ler o arquivo.");
    }
  }

  function next() {
    setFieldError(null);
    if (source === "xml") {
      if (loaded && !loaded.blocking) {
        const { nfe } = loaded;
        onNext({
          source,
          content: { kind: "invoice", key: nfe.key, xml: loaded.xml },
          nfe: { number: nfe.number, totalValue: nfe.totalValue, warnings: loaded.warnings },
          recipient: recipientFromNfe(nfe.recipient),
        });
      } else if (!loaded && previousXml) {
        onNext({ source, content: previousXml.content, nfe: previousXml.nfe });
      }
      return;
    }
    const content: ContentDraft =
      source === "declaration" ? { kind: "declaration", description } : { kind: "invoice", key: key.replace(/\D/g, "") };
    const parsed = contentSchema.safeParse(content);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Confira o documento.");
      return;
    }
    onNext({ source, content });
  }

  const canContinue = source !== "xml" || (loaded ? !loaded.blocking : Boolean(previousXml));

  const option = (value: DocumentSource, label: string, hint: string, Icon: typeof FileText) => (
    <button
      type="button"
      role="radio"
      aria-checked={source === value}
      onClick={() => {
        setSource(value);
        setFieldError(null);
      }}
      className={`card flex items-start gap-3 p-3 text-left transition ${
        source === value ? "border-accent bg-accent-soft ring-2 ring-accent" : "hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${source === value ? "text-accent-fg" : "text-zinc-400"}`} aria-hidden />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
      </span>
    </button>
  );

  const summaryNumber = loaded?.nfe.number ?? previousXml?.nfe?.number;

  return (
    <StepShell back={{ label: "Cancelar", onClick: onCancel }} next={{ label: "Continuar", onClick: next, disabled: !canContinue }}>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Qual documento acompanha o envio?</p>
      <div role="radiogroup" aria-label="Documento do envio" className="grid gap-2 sm:grid-cols-3">
        {option("xml", "Nota fiscal (XML)", "Preenche o destinatário sozinho", FileCode2)}
        {option("key", "Só a chave da NF-e", "Destinatário digitado", Receipt)}
        {option("declaration", "Declaração de conteúdo", "Sem nota fiscal", FileText)}
      </div>

      {source === "xml" && (
        <div className="space-y-3">
          <label
            htmlFor="c-xml"
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-sm font-medium text-zinc-600 transition hover:border-accent hover:text-accent-fg dark:border-zinc-700 dark:text-zinc-300"
          >
            <Upload className="h-5 w-5" aria-hidden />
            {summaryNumber ? "Escolher outro XML" : "Escolher o XML da NF-e"}
          </label>
          <input
            id="c-xml"
            type="file"
            accept=".xml,text/xml,application/xml"
            className="sr-only"
            onChange={(event) => void readXml(event.target.files?.[0])}
          />
          {fileError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {fileError}
            </p>
          )}
          {loaded && (
            <div className="card space-y-1 p-3 text-sm" data-testid="nfe-summary">
              <p className="font-semibold">NF-e nº {loaded.nfe.number}</p>
              <p className="text-zinc-600 dark:text-zinc-300">
                {loaded.nfe.recipient.name} · {loaded.nfe.recipient.city}/{loaded.nfe.recipient.stateAbbr} ·{" "}
                {formatCep(loaded.nfe.recipient.postalCode)}
              </p>
              <p className="text-zinc-600 dark:text-zinc-300">Valor da nota: {formatCurrency(loaded.nfe.totalValue)}</p>
            </div>
          )}
          {!loaded && previousXml && (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">NF-e nº {previousXml.nfe?.number} já carregada.</p>
          )}
          {loaded?.blocking && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {loaded.blocking}
            </p>
          )}
          {loaded?.blocking && onRequote && (
            <button
              type="button"
              onClick={() => onRequote({ nfe: loaded.nfe, xml: loaded.xml })}
              className="h-11 w-full rounded-xl border border-zinc-300 px-4 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Refazer a cotação com a nota
            </button>
          )}
          {loaded?.warnings.map((warning) => (
            <p key={warning} className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {warning}
            </p>
          ))}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">O arquivo é lido neste aparelho e não é enviado a nenhum servidor.</p>
        </div>
      )}

      {source === "key" && companyId === AZUL_COMPANY_ID && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          A Azul Cargo exige o XML da nota fiscal. Use a opção &ldquo;Nota fiscal (XML)&rdquo;.
        </p>
      )}

      {source === "key" && (
        <Field
          id="c-key"
          label="Chave de acesso da NF-e (44 dígitos)"
          inputMode="numeric"
          autoComplete="off"
          value={key}
          onChange={(event) => setKey(formatKey(event.target.value))}
          error={fieldError ?? undefined}
          className="[&_input]:font-mono [&_input]:text-sm"
        />
      )}

      {source === "declaration" && (
        <div className="space-y-2">
          <Field
            id="c-description"
            label="O que vai no pacote"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            error={fieldError ?? undefined}
          />
          {declaredValue > DECLARATION_INSURANCE_LIMIT && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Valor declarado de {formatCurrency(declaredValue)}. Algumas transportadoras, como a Jadlog, recusam declaração de
              conteúdo acima de {formatCurrency(DECLARATION_INSURANCE_LIMIT)}. Nesses casos, use a nota fiscal.
            </p>
          )}
        </div>
      )}
    </StepShell>
  );
}
