const toCents = (value: number) => Math.round(value * 100);

/** Amount to top up the wallet so it covers `total`; 0 when the balance is enough. */
export function pixTopUpFor(total: number, balance: number, minimum = 1): number {
  const missing = toCents(total) - toCents(balance);
  if (missing <= 0) return 0;
  return Math.max(missing, toCents(minimum)) / 100;
}
