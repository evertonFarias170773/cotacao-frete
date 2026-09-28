import { describe, expect, test } from "vitest";
import { safeNextPath } from "./safeNextPath";

describe("safeNextPath", () => {
  test("keeps internal paths, with their query", () => {
    expect(safeNextPath("/envios")).toBe("/envios");
    expect(safeNextPath("/envios?status=posted")).toBe("/envios?status=posted");
  });
  test("falls back to the home page for anything that could leave the app", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("envios")).toBe("/");
  });
  test("never sends the user back to the login page", () => {
    expect(safeNextPath("/entrar")).toBe("/");
  });
});
