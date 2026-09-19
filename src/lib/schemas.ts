import { z } from "zod";
import { ORIGIN_IDS } from "@/config/origins";
import { onlyDigits, parseDecimal } from "./format";

const POSITIVE = "Deve ser maior que zero";
const CEP_MESSAGE = "Informe um CEP com 8 dígitos.";

const positiveNumber = z.number({ error: "Número inválido" }).positive({ error: POSITIVE });

/** One package, in cm / kg / BRL. `quantity` repeats identical packages. */
export const volumeSchema = z.object({
  height: positiveNumber,
  width: positiveNumber,
  length: positiveNumber,
  weight: positiveNumber,
  insurance: z.number({ error: "Número inválido" }).min(0, { error: "Não pode ser negativo" }),
  quantity: z
    .number({ error: "Número inválido" })
    .int({ error: "Use um número inteiro" })
    .min(1, { error: "Mínimo 1" })
    .max(50, { error: "Máximo 50" }),
});

export const cepSchema = z
  .string({ error: CEP_MESSAGE })
  .transform(onlyDigits)
  .pipe(z.string().length(8, { error: CEP_MESSAGE }));

export const quoteOptionsSchema = z.object({
  receipt: z.boolean().default(false),
  own_hand: z.boolean().default(false),
});

/** What the browser sends to /api/quote (numbers already parsed). */
export const quoteRequestSchema = z.object({
  originId: z.enum(ORIGIN_IDS, { error: "Escolha a origem." }),
  destinationCep: cepSchema,
  volumes: z
    .array(volumeSchema)
    .min(1, { error: "Adicione pelo menos um volume." })
    .max(20, { error: "Máximo de 20 volumes por cotação." }),
  options: quoteOptionsSchema.default({ receipt: false, own_hand: false }),
});

export type Volume = z.output<typeof volumeSchema>;
export type QuoteOptions = z.output<typeof quoteOptionsSchema>;
export type QuoteRequest = z.output<typeof quoteRequestSchema>;

/** Text field from the form -> number, accepting "0,3" or "1.250,00". */
const numericField = z
  .string({ error: "Obrigatório" })
  .trim()
  .min(1, { error: "Obrigatório" })
  .transform((text, ctx) => {
    const value = parseDecimal(text);
    if (value === null) {
      ctx.addIssue({ code: "custom", message: "Número inválido" });
      return z.NEVER;
    }
    return value;
  });

export const volumeFormSchema = z
  .object({
    height: numericField,
    width: numericField,
    length: numericField,
    weight: numericField,
    insurance: numericField,
    quantity: numericField,
  })
  .pipe(volumeSchema);

/** Same rules as quoteRequestSchema, but fed with the raw string inputs of the form. */
export const quoteFormSchema = z.object({
  originId: z.enum(ORIGIN_IDS, { error: "Escolha a origem." }),
  destinationCep: cepSchema,
  volumes: z.array(volumeFormSchema).min(1, { error: "Adicione pelo menos um volume." }),
  options: quoteOptionsSchema,
});

export type QuoteFormInput = z.input<typeof quoteFormSchema>;
export type QuoteFormOutput = z.output<typeof quoteFormSchema>;
export type VolumeFormInput = z.input<typeof volumeFormSchema>;
