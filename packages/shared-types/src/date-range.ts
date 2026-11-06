/**
 * Rollup `bucket` values are day/hour-truncated (time_bucket), so a query
 * filtering `bucket >= someTimestamp` with a precise (non-midnight)
 * timestamp silently excludes that entire day's bucket row — the bug this
 * project hit twice (once in db/benchmark.ts, once in the metrics routes)
 * before this got pulled out into one shared helper.
 */
export function startOfUtcDay(iso: string): string {
  return `${iso.slice(0, 10)}T00:00:00.000Z`;
}
