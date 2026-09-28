import { beforeEach, describe, expect, test, vi } from "vitest";
import type { QuoteRequest } from "./schemas";
import {
  clearPendingPayment,
  createHistoryEntry,
  loadHistory,
  loadLastOrigin,
  loadPendingPayment,
  pushHistory,
  saveLastOrigin,
  savePendingPayment,
  type HistoryEntry,
  type PendingPayment,
} from "./storage";

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

const entry = (n: number): HistoryEntry => ({
  id: `e${n}`,
  at: n,
  originId: "poa",
  destinationCep: "01018020",
  volumes: [{ height: 10, width: 10, length: 10, weight: 1, insurance: 0, quantity: 1 }],
  options: { receipt: false, own_hand: false },
  bestPrice: n,
  bestService: "PAC",
  bestCompany: "Correios",
});

describe("storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeLocalStorage());
  });

  test("remembers the last origin", () => {
    expect(loadLastOrigin()).toBeNull();
    saveLastOrigin("scs");
    expect(loadLastOrigin()).toBe("scs");
  });

  test("ignores garbage stored under the origin key", () => {
    localStorage.setItem("cotador:lastOrigin", "rio");
    expect(loadLastOrigin()).toBeNull();
  });

  test("history keeps newest first and at most 10 entries", () => {
    for (let i = 1; i <= 12; i++) pushHistory(entry(i));
    const history = loadHistory();
    expect(history).toHaveLength(10);
    expect(history[0].id).toBe("e12");
    expect(history[9].id).toBe("e3");
  });

  test("returns empty history when stored value is corrupt", () => {
    localStorage.setItem("cotador:history", "{not json");
    expect(loadHistory()).toEqual([]);
  });

  test("does not throw when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveLastOrigin("poa")).not.toThrow();
    expect(loadLastOrigin()).toBeNull();
    expect(loadHistory()).toEqual([]);
  });

  test("does not throw when localStorage throws (private mode)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => pushHistory(entry(1))).not.toThrow();
    expect(loadHistory()).toEqual([]);
  });
});

describe("createHistoryEntry", () => {
  test("copies the request and the best option, stamping id and time", () => {
    const before = Date.now();
    const created = createHistoryEntry(
      {
        originId: "scs",
        destinationCep: "01018020",
        volumes: [{ height: 10, width: 10, length: 10, weight: 1, insurance: 50, quantity: 2 }],
        options: { receipt: true, own_hand: false },
      },
      { id: 3, service: "SEDEX", company: "Correios", price: 42.5 },
    );
    expect(created).toMatchObject({
      originId: "scs",
      destinationCep: "01018020",
      options: { receipt: true, own_hand: false },
      bestPrice: 42.5,
      bestService: "SEDEX",
      bestCompany: "Correios",
    });
    expect(created.volumes).toHaveLength(1);
    expect(created.at).toBeGreaterThanOrEqual(before);
  });

  test("gives identical requests the same id, so repeating one does not duplicate the history", () => {
    const request: QuoteRequest = {
      originId: "poa",
      destinationCep: "01018020",
      volumes: [{ height: 10, width: 10, length: 10, weight: 1, insurance: 0, quantity: 1 }],
      options: { receipt: false, own_hand: false },
    };
    const best = { id: 1, service: "PAC", company: "Correios", price: 10 };

    expect(createHistoryEntry(request, best).id).toBe(createHistoryEntry(request, best).id);
    expect(createHistoryEntry({ ...request, destinationCep: "90010000" }, best).id).not.toBe(
      createHistoryEntry(request, best).id,
    );
  });
});

describe("pending payment", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeLocalStorage());
  });

  const pending: PendingPayment = {
    orders: ["a2db3844-f23e-4367-b6cf-02fb76413df5"],
    total: 68.83,
    label: "Correios · PAC para Cliente Ficticio",
    pix: {
      paymentId: "a2db3a3b-0000-4000-8000-000000000001",
      amount: 68.83,
      qrCodeUrl: "https://example.com/qr.svg",
      copyPaste: "000201-FICTICIO",
      expiresAt: "2026-09-29T16:43:06",
    },
    createdAt: 1000,
  };

  test("survives a closed tab", () => {
    expect(loadPendingPayment()).toBeNull();
    savePendingPayment(pending);
    expect(loadPendingPayment()).toEqual(pending);
  });

  test("is forgotten once the orders are paid", () => {
    savePendingPayment(pending);
    clearPendingPayment();
    expect(loadPendingPayment()).toBeNull();
  });

  test("ignores corrupt or incomplete data", () => {
    localStorage.setItem("cotador:pendingPayment", "{nao json");
    expect(loadPendingPayment()).toBeNull();
    localStorage.setItem("cotador:pendingPayment", JSON.stringify({ orders: "x" }));
    expect(loadPendingPayment()).toBeNull();
  });
});
