import type { ProductPreset } from "@/config/products";

/** Teto que mantém os volumes gerados dentro dos limites do formulário. */
export const MAX_PRESET_UNITS = 300;

export type PlannedVolume = {
  /** Unidades do produto dentro de cada um destes volumes. */
  unitsPerVolume: number;
  /** Quantos volumes idênticos a este. */
  quantity: number;
  height: number;
  width: number;
  length: number;
  weight: number;
  insurance: number;
};

export type PlanTotals = { volumes: number; units: number; weight: number; value: number };

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

/** Distribui `units` no menor número de pacotes possível, o mais equilibrado que der. */
export function splitUnits(units: number, maxPerVolume: number): number[] {
  if (!Number.isInteger(units) || units < 1) return [];
  const count = Math.ceil(units / maxPerVolume);
  const base = Math.floor(units / count);
  const remainder = units % count;
  return Array.from({ length: count }, (_, index) => (index < remainder ? base + 1 : base));
}

/** Monta os volumes de um produto a partir da quantidade, agrupando os idênticos. */
export function planPresetVolumes(preset: ProductPreset, units: number): PlannedVolume[] {
  if (units > MAX_PRESET_UNITS) return [];

  const plan: PlannedVolume[] = [];
  for (const unitsPerVolume of splitUnits(units, preset.maxPerVolume)) {
    const previous = plan[plan.length - 1];
    if (previous?.unitsPerVolume === unitsPerVolume) {
      previous.quantity += 1;
      continue;
    }
    plan.push({
      unitsPerVolume,
      quantity: 1,
      height: round(preset.unitHeight * unitsPerVolume, 2),
      width: preset.width,
      length: preset.length,
      weight: round(preset.unitWeight * unitsPerVolume, 3),
      insurance: round(preset.unitPrice * unitsPerVolume, 2),
    });
  }
  return plan;
}

export function summarizePlan(plan: PlannedVolume[]): PlanTotals {
  const totals = plan.reduce<PlanTotals>(
    (acc, volume) => ({
      volumes: acc.volumes + volume.quantity,
      units: acc.units + volume.unitsPerVolume * volume.quantity,
      weight: acc.weight + volume.weight * volume.quantity,
      value: acc.value + volume.insurance * volume.quantity,
    }),
    { volumes: 0, units: 0, weight: 0, value: 0 },
  );
  return { ...totals, weight: round(totals.weight, 3), value: round(totals.value, 2) };
}
