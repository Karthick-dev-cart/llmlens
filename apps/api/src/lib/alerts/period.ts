export function periodStart(period: string, now: Date): Date {
  if (period === "daily") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  // "monthly"
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
