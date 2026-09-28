"use client";

import { useEffect, useRef, useState } from "react";
import { AGENCY_COMPANIES } from "@/config/agencies";
import type { OriginId } from "@/config/origins";
import { callApi } from "@/lib/apiClient";
import { Spinner } from "./StepShell";

type Agency = { id: number; name: string; address: string; preferred: boolean };
export type AgencyChoice = { id: number; name: string } | undefined;

type Props = {
  origin: OriginId;
  companyId?: number;
  selectedId?: number;
  onChange: (agency: AgencyChoice) => void;
  /** Tells the parent whether it may continue (the list is still loading). */
  onReadyChange: (ready: boolean) => void;
};

export function needsAgency(companyId?: number): boolean {
  return companyId !== undefined && AGENCY_COMPANIES.has(companyId);
}

/** Drop-off agency for carriers that do not pick packages up; the team's usual one comes first. */
export function AgencyPicker({ origin, companyId, selectedId, onChange, onReadyChange }: Props) {
  const [agencies, setAgencies] = useState<Agency[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Latest callbacks and selection, so only the carrier and origin trigger a new list.
  const latest = useRef({ onChange, onReadyChange, selectedId });
  useEffect(() => {
    latest.current = { onChange, onReadyChange, selectedId };
  });

  useEffect(() => {
    let active = true;
    latest.current.onReadyChange(false);
    callApi<{ agencies: Agency[] }>(`/api/shipments/agencies?company=${companyId}&origin=${origin}`)
      .then(({ agencies: list }) => {
        if (!active) return;
        setAgencies(list);
        const chosen = list.find((a) => a.id === latest.current.selectedId) ?? list[0];
        latest.current.onChange(chosen ? { id: chosen.id, name: chosen.name } : undefined);
        latest.current.onReadyChange(true);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Não foi possível listar as agências.");
        latest.current.onReadyChange(true);
      });
    return () => {
      active = false;
    };
  }, [companyId, origin]);

  return (
    <div>
      <label htmlFor="c-agency" className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Agência onde o pacote será entregue
      </label>
      {agencies === null && !error && <Spinner label="Buscando agências…" />}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {agencies && agencies.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nenhuma agência encontrada perto da origem. A transportadora pode recusar o envio sem agência.
        </p>
      )}
      {agencies && agencies.length > 0 && (
        <select
          id="c-agency"
          value={selectedId ?? ""}
          onChange={(event) => {
            const agency = agencies.find((a) => a.id === Number(event.target.value));
            onChange(agency ? { id: agency.id, name: agency.name } : undefined);
          }}
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
  );
}
