import { describe, expect, test } from "vitest";
import { ORIGINS, getOrigin } from "./origins";

describe("origins", () => {
  test("has the two fixed senders with digit-only CEPs", () => {
    expect(ORIGINS.map((o) => o.id)).toEqual(["poa", "scs"]);
    expect(getOrigin("poa")).toEqual({ id: "poa", name: "Porto Alegre", cep: "90660130" });
    expect(getOrigin("scs")).toEqual({ id: "scs", name: "Santa Cruz do Sul", cep: "96810400" });
  });
});
