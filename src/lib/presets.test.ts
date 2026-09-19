import { describe, expect, test } from "vitest";
import { TRIBAND } from "@/config/products";
import { MAX_PRESET_UNITS, planPresetVolumes, splitUnits, summarizePlan } from "./presets";

describe("splitUnits", () => {
  test("keeps everything in one package up to the limit", () => {
    expect(splitUnits(1, 15)).toEqual([1]);
    expect(splitUnits(15, 15)).toEqual([15]);
  });

  test("splits evenly when the total exceeds the limit", () => {
    expect(splitUnits(18, 15)).toEqual([9, 9]);
    expect(splitUnits(30, 15)).toEqual([15, 15]);
  });

  test("uses the fewest packages, spreading the remainder", () => {
    expect(splitUnits(17, 15)).toEqual([9, 8]);
    expect(splitUnits(31, 15)).toEqual([11, 10, 10]);
    expect(splitUnits(16, 15)).toEqual([8, 8]);
  });

  test("rejects zero, negatives and fractions", () => {
    expect(splitUnits(0, 15)).toEqual([]);
    expect(splitUnits(-3, 15)).toEqual([]);
    expect(splitUnits(2.5, 15)).toEqual([]);
  });
});

describe("planPresetVolumes (Triband)", () => {
  test("1 unit matches the reference package", () => {
    expect(planPresetVolumes(TRIBAND, 1)).toEqual([
      { unitsPerVolume: 1, quantity: 1, height: 2.4, width: 22, length: 32, weight: 1.05, insurance: 135 },
    ]);
  });

  test("2 and 3 units stack height, weight and declared value", () => {
    expect(planPresetVolumes(TRIBAND, 2)[0]).toMatchObject({ height: 4.8, weight: 2.1, insurance: 270 });
    expect(planPresetVolumes(TRIBAND, 3)[0]).toMatchObject({ height: 7.2, weight: 3.15, insurance: 405 });
  });

  test("15 units still fit a single volume", () => {
    expect(planPresetVolumes(TRIBAND, 15)).toEqual([
      { unitsPerVolume: 15, quantity: 1, height: 36, width: 22, length: 32, weight: 15.75, insurance: 2025 },
    ]);
  });

  test("18 units become two identical volumes of 9, grouped as quantity 2", () => {
    expect(planPresetVolumes(TRIBAND, 18)).toEqual([
      { unitsPerVolume: 9, quantity: 2, height: 21.6, width: 22, length: 32, weight: 9.45, insurance: 1215 },
    ]);
  });

  test("an uneven split produces one entry per distinct package", () => {
    const plan = planPresetVolumes(TRIBAND, 17);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ unitsPerVolume: 9, quantity: 1, height: 21.6, weight: 9.45 });
    expect(plan[1]).toMatchObject({ unitsPerVolume: 8, quantity: 1, height: 19.2, weight: 8.4, insurance: 1080 });
  });

  test("groups the repeated package of an uneven split", () => {
    const plan = planPresetVolumes(TRIBAND, 31);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ unitsPerVolume: 11, quantity: 1 });
    expect(plan[1]).toMatchObject({ unitsPerVolume: 10, quantity: 2 });
  });

  test("never leaves floating point noise in the numbers", () => {
    for (let units = 1; units <= MAX_PRESET_UNITS; units++) {
      for (const volume of planPresetVolumes(TRIBAND, units)) {
        expect(volume.height).toBe(Number(volume.height.toFixed(2)));
        expect(volume.weight).toBe(Number(volume.weight.toFixed(3)));
        expect(volume.insurance).toBe(Number(volume.insurance.toFixed(2)));
      }
    }
  });

  test("keeps every generated volume within the form limits", () => {
    for (let units = 1; units <= MAX_PRESET_UNITS; units++) {
      const plan = planPresetVolumes(TRIBAND, units);
      expect(plan.length).toBeLessThanOrEqual(20);
      for (const volume of plan) {
        expect(volume.quantity).toBeLessThanOrEqual(50);
        expect(volume.unitsPerVolume).toBeLessThanOrEqual(TRIBAND.maxPerVolume);
      }
    }
  });

  test("returns nothing for invalid or oversized quantities", () => {
    expect(planPresetVolumes(TRIBAND, 0)).toEqual([]);
    expect(planPresetVolumes(TRIBAND, 1.5)).toEqual([]);
    expect(planPresetVolumes(TRIBAND, MAX_PRESET_UNITS + 1)).toEqual([]);
  });
});

describe("summarizePlan", () => {
  test("totals volumes, units, weight and declared value", () => {
    expect(summarizePlan(planPresetVolumes(TRIBAND, 18))).toEqual({
      volumes: 2,
      units: 18,
      weight: 18.9,
      value: 2430,
    });
  });

  test("totals an uneven split", () => {
    expect(summarizePlan(planPresetVolumes(TRIBAND, 17))).toEqual({
      volumes: 2,
      units: 17,
      weight: 17.85,
      value: 2295,
    });
  });

  test("an empty plan totals zero", () => {
    expect(summarizePlan([])).toEqual({ volumes: 0, units: 0, weight: 0, value: 0 });
  });
});
