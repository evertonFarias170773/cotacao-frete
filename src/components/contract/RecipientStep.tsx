"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { formatCep } from "@/lib/format";
import { recipientSchema, type Recipient, type RecipientInput } from "@/lib/recipient";
import { lookupCep } from "@/lib/viacep";
import { Field, StepShell } from "./StepShell";

type Props = {
  destinationCep: string;
  initial: RecipientInput;
  onBack: () => void;
  onNext: (recipient: RecipientInput) => void;
};

export function RecipientStep({ destinationCep, initial, onBack, onNext }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<RecipientInput, unknown, Recipient>({ resolver: zodResolver(recipientSchema), defaultValues: initial });

  // Fill the address from the quoted CEP, without overwriting anything the user already typed.
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

  const submit = handleSubmit(() => onNext(getValues()));

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <StepShell back={{ label: "Cancelar", onClick: onBack }} next={{ label: "Continuar", type: "submit" }}>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Quem recebe o envio.</p>
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
      </StepShell>
    </form>
  );
}
