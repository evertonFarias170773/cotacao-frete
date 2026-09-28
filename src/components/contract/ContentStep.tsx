"use client";

import { FileText, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { AGENCY_COMPANIES } from "@/config/agencies";
import type { OriginId } from "@/config/origins";
import { callApi } from "@/lib/apiClient";
import { formatCurrency } from "@/lib/format";
import { contentSchema } from "@/lib/recipient";
import { DECLARATION_INSURANCE_LIMIT, type ContentDraft } from "./types";
import { Field, Spinner, StepShell } from "./StepShell";

type Agency = { id: number; name: string; address: string; preferred: boolean };

type Props = {
  origin: OriginId;
  companyId?: number;
  declaredValue: number;
  initialContent: ContentDraft;
  initialAgencyId?: number;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onNext: (content: ContentDraft, agency?: { id: number; name: string }) => void;
};

/** NF-e keys are easier to check in groups of four digits. */
const formatKey = (value: string) =>
  value
    .replace(/\D/g, "")
    .slice(0, 44)
    .replace(/(\d{4})(?=\d)/g, "$1 ");

export function ContentStep(props: Props) {
  const { origin, companyId, declaredValue, initialContent, busy, error, onBack, onNext } = props;
  const [kind, setKind] = useState<ContentDraft["kind"]>(initialContent.kind);
  const [description, setDescription] = useState(initialContent.kind === "declaration" ? initialContent.description : "");
  const [key, setKey] = useState(initialContent.kind === "invoice" ? formatKey(initialContent.key) : "");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const needsAgency = companyId !== undefined && AGENCY_COMPANIES.has(companyId);
  const [agencies, setAgencies] = useState<Agency[] | null>(null);
  const [agencyError, setAgencyError] = useState<string | null>(null);
  const [agencyId, setAgencyId] = useState<number | undefined>(props.initialAgencyId);

  useEffect(() => {
    if (!needsAgency) return;
    let active = true;
    callApi<{ agencies: Agency[] }>(`/api/shipments/agencies?company=${companyId}&origin=${origin}`)
      .then(({ agencies: list }) => {
        if (!active) return;
        setAgencies(list);
        setAgencyId((current) => current ?? list[0]?.id);
      })
      .catch((err: unknown) => {
        if (active) setAgencyError(err instanceof Error ? err.message : "Não foi possível listar as agências.");
      });
    return () => {
      active = false;
    };
  }, [needsAgency, companyId, origin]);

  function next() {
    const content: ContentDraft = kind === "declaration" ? { kind, description } : { kind, key: key.replace(/\D/g, "") };
    const parsed = contentSchema.safeParse(content);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Confira o conteúdo.");
      return;
    }
    setFieldError(null);
    const agency = agencies?.find((a) => a.id === agencyId);
    onNext(content, agency ? { id: agency.id, name: agency.name } : undefined);
  }

  const option = (value: ContentDraft["kind"], label: string, hint: string, Icon: typeof FileText) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === value}
      onClick={() => {
        setKind(value);
        setFieldError(null);
      }}
      className={`card flex items-start gap-3 p-3 text-left transition ${
        kind === value ? "border-accent bg-accent-soft ring-2 ring-accent" : "hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${kind === value ? "text-accent-fg" : "text-zinc-400"}`} aria-hidden />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
      </span>
    </button>
  );

  return (
    <StepShell
      error={error}
      back={{ label: "Voltar", onClick: onBack, disabled: busy }}
      next={{ label: "Revisar envio", onClick: next, busy, disabled: needsAgency && agencies === null && !agencyError }}
    >
      <div role="radiogroup" aria-label="Documento do conteúdo" className="grid grid-cols-2 gap-3">
        {option("declaration", "Declaração de conteúdo", "Sem nota fiscal", FileText)}
        {option("invoice", "Nota fiscal", "NF-e modelo 55", Receipt)}
      </div>

      {kind === "declaration" ? (
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
      ) : (
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

      {needsAgency && (
        <div>
          <label htmlFor="c-agency" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Agência onde o pacote será entregue
          </label>
          {agencies === null && !agencyError && <Spinner label="Buscando agências…" />}
          {agencyError && <p className="text-sm text-red-600 dark:text-red-400">{agencyError}</p>}
          {agencies && agencies.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nenhuma agência encontrada perto da origem. A transportadora pode recusar o envio sem agência.
            </p>
          )}
          {agencies && agencies.length > 0 && (
            <select
              id="c-agency"
              value={agencyId ?? ""}
              onChange={(event) => setAgencyId(Number(event.target.value))}
              className="field"
            >
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.preferred ? "★ " : ""}
                  {agency.name} — {agency.address}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </StepShell>
  );
}
