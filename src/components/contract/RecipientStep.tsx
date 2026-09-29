"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileCheck2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { OriginId } from "@/config/origins";
import { formatCep } from "@/lib/format";
import { recipientSchema, type Recipient, type RecipientInput } from "@/lib/recipient";
import { lookupCep } from "@/lib/viacep";
import { AgencyPicker, needsAgency, type AgencyChoice } from "./AgencyPicker";
import { Field, StepShell } from "./StepShell";

type Props = {
  destinationCep: string;
  origin: OriginId;
  companyId?: number;
  initial: RecipientInput;
  initialAgencyId?: number;
  /** Where the fields came from, e.g. "Dados preenchidos pela NF-e nº 12345." */
  prefilledNote?: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onNext: (recipient: RecipientInput, agency: AgencyChoice) => void;
};

export function RecipientStep(props: Props) {
  const { destinationCep, origin, companyId, initial, prefilledNote, busy, error, onBack, onNext } = props;
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<RecipientInput, unknown, Recipient>({ resolver: zodResolver(recipientSchema), defaultValues: initial });

  const withAgency = needsAgency(companyId);
  const [agency, setAgency] = useState<AgencyChoice>(
    props.initialAgencyId ? { id: props.initialAgencyId, name: "" } : undefined,
  );
  const [agencyReady, setAgencyReady] = useState(!withAgency);

  // Fill the address from the quoted CEP, without overwriting anything already there (typed or from the XML).
  useEffect(() => {
    const controller = new AbortController();
    lookupCep(destinationCep, controller.signal)
      .then((info) => {
        if (!info) return;
        const fill = (field: "address" | "district" | "city" | "stateAbbr", value: string) => {
          if (value && !getValues(field)) setValue(field, value);
        };
        fill("address", info.street);
        fill("district", info.district);
        fill("city", info.city);
        fill("stateAbbr", info.state);
      })
      .catch(() => {
        // ViaCEP is a convenience; the user can type the address.
      });
    return () => controller.abort();
  }, [destinationCep, getValues, setValue]);

  const submit = handleSubmit(() => onNext(getValues(), agency));

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <StepShell
        error={error}
        back={{ label: "Voltar", onClick: onBack, disabled: busy }}
        next={{ label: "Revisar envio", type: "submit", busy, disabled: !agencyReady }}
      >
        {prefilledNote ? (
          <p className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-fg">
            <FileCheck2 className="h-4 w-4 shrink-0" aria-hidden />
            {prefilledNote} Confira e complete o que faltar.
          </p>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Quem recebe o envio.</p>
        )}
        <Field id="r-name" label="Nome completo ou razão social" autoComplete="name" error={errors.name?.message} {...register("name")} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="r-document" label="CPF ou CNPJ" autoComplete="off" error={errors.document?.message} {...register("document")} />
          <Field
            id="r-phone"
            label="Telefone com DDD"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            error={errors.phone?.message}
            {...register("phone")}
          />
        </div>
        <Field
          id="r-email"
          label="E-mail (opcional)"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">CEP (da cotação)</p>
            <p className="flex h-11 items-center rounded-xl bg-zinc-100 px-3 text-base text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {formatCep(destinationCep)}
            </p>
          </div>
          <Field id="r-number" label="Número" inputMode="numeric" error={errors.number?.message} {...register("number")} />
        </div>
        <Field id="r-address" label="Rua" autoComplete="address-line1" error={errors.address?.message} {...register("address")} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="r-complement" label="Complemento" error={errors.complement?.message} {...register("complement")} />
          <Field id="r-district" label="Bairro" error={errors.district?.message} {...register("district")} />
        </div>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <Field id="r-city" label="Cidade" error={errors.city?.message} {...register("city")} />
          <Field id="r-state" label="UF" maxLength={2} error={errors.stateAbbr?.message} {...register("stateAbbr")} />
        </div>
        {withAgency && (
          <AgencyPicker
            origin={origin}
            companyId={companyId}
            selectedId={agency?.id}
            onChange={setAgency}
            onReadyChange={setAgencyReady}
          />
        )}
      </StepShell>
    </form>
  );
}
