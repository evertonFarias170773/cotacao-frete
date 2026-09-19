import { ORIGIN_IDS, type OriginId } from "@/config/origins";
import type { QuoteOptions, QuoteRequest, Volume } from "./schemas";
import { requestSignature } from "./signature";
import type { QuoteOption } from "./types";

const ORIGIN_KEY = "cotador:lastOrigin";
const HISTORY_KEY = "cotador:history";
const HISTORY_MAX = 10;

export type HistoryEntry = {
  id: string;
  /** Epoch milliseconds. */
  at: number;
  originId: OriginId;
  destinationCep: string;
  volumes: Volume[];
  options: QuoteOptions;
  bestPrice: number;
  bestService: string;
  bestCompany: string;
};

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage may be full or blocked (private mode); persistence is optional.
  }
}

export function loadLastOrigin(): OriginId | null {
  const value = read(ORIGIN_KEY);
  return value && (ORIGIN_IDS as readonly string[]).includes(value) ? (value as OriginId) : null;
}

export function saveLastOrigin(id: OriginId): void {
  write(ORIGIN_KEY, id);
}

export function loadHistory(): HistoryEntry[] {
  const raw = read(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** Adds an entry to the front of the history, keeping at most HISTORY_MAX entries. */
export function pushHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX);
  write(HISTORY_KEY, JSON.stringify(next));
  return next;
}

/** Builds the history record for a successful quote from the request and its cheapest option. */
export function createHistoryEntry(request: QuoteRequest, best: QuoteOption): HistoryEntry {
  const now = Date.now();
  return {
    // Same inputs reuse the same id, so repeating a quote moves it up instead of duplicating it.
    id: requestSignature(request),
    at: now,
    originId: request.originId,
    destinationCep: request.destinationCep,
    volumes: request.volumes,
    options: request.options,
    bestPrice: best.price,
    bestService: best.service,
    bestCompany: best.company,
  };
}
