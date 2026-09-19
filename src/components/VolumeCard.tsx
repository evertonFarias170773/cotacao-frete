"use client";

import { Copy, Trash2 } from "lucide-react";
import { useFormContext } from "react-hook-form";
import type { QuoteFormInput, VolumeFormInput } from "@/lib/schemas";
import { NumberField } from "./NumberField";

type Props = {
  index: number;
  canRemove: boolean;
  onDuplicate: () => void;
  onRemove: () => void;
};

type FieldSpec = {
  name: keyof VolumeFormInput;
  label: string;
  prefix?: string;
  suffix?: string;
  inputMode: "decimal" | "numeric";
};

const DIMENSIONS: FieldSpec[] = [
  { name: "height", label: "Altura", suffix: "cm", inputMode: "decimal" },
  { name: "width", label: "Largura", suffix: "cm", inputMode: "decimal" },
  { name: "length", label: "Comprimento", suffix: "cm", inputMode: "decimal" },
];

const DETAILS: FieldSpec[] = [
  { name: "weight", label: "Peso", suffix: "kg", inputMode: "decimal" },
  { name: "insurance", label: "Valor declarado", prefix: "R$", inputMode: "decimal" },
  { name: "quantity", label: "Quantidade", suffix: "un.", inputMode: "numeric" },
];

export function VolumeCard({ index, canRemove, onDuplicate, onRemove }: Props) {
  const {
    register,
    formState: { errors },
  } = useFormContext<QuoteFormInput>();
  const volumeErrors = errors.volumes?.[index];
  const number = index + 1;

  const renderField = (spec: FieldSpec) => (
    <NumberField
      key={spec.name}
      id={`volumes.${index}.${spec.name}`}
      label={spec.label}
      prefix={spec.prefix}
      suffix={spec.suffix}
      inputMode={spec.inputMode}
      placeholder={spec.name === "quantity" ? "1" : "0"}
      error={volumeErrors?.[spec.name]?.message}
      {...register(`volumes.${index}.${spec.name}`)}
    />
  );

  return (
    <section className="card p-4" aria-labelledby={`volume-${index}-title`}>
      <header className="mb-3 flex items-center justify-between">
        <h3 id={`volume-${index}-title`} className="font-semibold">
          Volume {number}
        </h3>
        <div className="-mr-2 flex">
          <button
            type="button"
            className="btn-icon"
            onClick={onDuplicate}
            aria-label={`Duplicar volume ${number}`}
            title="Duplicar"
          >
            <Copy className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={onRemove}
            disabled={!canRemove}
            aria-label={`Remover volume ${number}`}
            title={canRemove ? "Remover" : "Mantenha pelo menos um volume"}
          >
            <Trash2 className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>
      <div className="grid grid-cols-3 gap-3">{DIMENSIONS.map(renderField)}</div>
      <div className="mt-3 grid grid-cols-3 gap-3">{DETAILS.map(renderField)}</div>
    </section>
  );
}
