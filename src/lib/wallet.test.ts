import { describe, expect, test } from "vitest";
import { pixTopUpFor } from "./wallet";

describe("pixTopUpFor", () => {
  test("no PIX when the balance covers the order", () => {
    expect(pixTopUpFor(74.95, 100)).toBe(0);
    expect(pixTopUpFor(74.95, 74.95)).toBe(0);
  });
  test("charges only what is missing", () => {
    expect(pixTopUpFor(74.95, 20.1)).toBe(54.85);
    expect(pixTopUpFor(74.95, 0)).toBe(74.95);
  });
  test("respects the gateway minimum", () => {
    expect(pixTopUpFor(74.95, 74.94)).toBe(1);
    expect(pixTopUpFor(74.95, 74.94, 5)).toBe(5);
  });
  test("works in cents, free of floating point noise", () => {
    expect(pixTopUpFor(0.3, 0.1, 0.01)).toBe(0.2);
    expect(pixTopUpFor(1215.3, 1000.1, 0.01)).toBe(215.2);
  });
});
