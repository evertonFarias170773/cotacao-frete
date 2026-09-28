import { describe, expect, test } from "vitest";
import { AGENCY_COMPANIES, preferredAgency } from "./agencies";

describe("preferredAgency", () => {
  test("uses the agency the team already drops packages at", () => {
    expect(preferredAgency("scs", 9)).toBe(5692); // Azul Cargo CSUF1, Santa Cruz do Sul
    expect(preferredAgency("poa", 9)).toBe(5677); // Azul Cargo QNS02, Canoas
    expect(preferredAgency("scs", 2)).toBe(214); // Jadlog CO Santa Cruz do Sul 02
    expect(preferredAgency("poa", 12)).toBe(13154); // Buslog Porto Alegre
  });

  test("has no default where the history has none", () => {
    expect(preferredAgency("poa", 2)).toBeUndefined();
    expect(preferredAgency("scs", 1)).toBeUndefined();
  });

  test("lists the carriers that drop packages at an agency", () => {
    expect([...AGENCY_COMPANIES].sort((a, b) => a - b)).toEqual([2, 6, 8, 9, 12]);
  });
});
