import type { GeneratorConfig } from "./generator.js";
import { generateEvents } from "./generator.js";

// Exported for reuse by anything that needs to refresh a continuous
// aggregate over an arbitrary window (e.g. the demo project's retention
// prune, which refreshes over the deleted range rather than a backfilled one).
export function floorToHour(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);
}

export function ceilToHour(d: Date): Date {
  return new Date(Math.ceil(d.getTime() / 3_600_000) * 3_600_000);
}

export function floorToDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function ceilToDay(d: Date): Date {
  const floored = floorToDay(d);
  return floored.getTime() === d.getTime() ? floored : new Date(floored.getTime() + 86_400_000);
}

// Shared standalone refresh of both continuous aggregates over [from, to) —
// used both after a backfill insert and after a retention delete.
export async function refreshAggregatesOver(from: Date, to: Date): Promise<void> {
  const { db } = await import("@llmlens/db");
  const { sql } = await import("drizzle-orm");

  const dailyFrom = floorToDay(from);
  const dailyTo = ceilToDay(to);
  await db.execute(
    sql`CALL refresh_continuous_aggregate('usage_rollup_daily', ${dailyFrom.toISOString()}::timestamptz, ${dailyTo.toISOString()}::timestamptz)`,
  );
  const hourlyFrom = floorToHour(from);
  const hourlyTo = ceilToHour(to);
  await db.execute(
    sql`CALL refresh_continuous_aggregate('usage_rollup_hourly', ${hourlyFrom.toISOString()}::timestamptz, ${hourlyTo.toISOString()}::timestamptz)`,
  );
}

export interface BackfillRangeOptions {
  projectId: string;
  orgId: string;
  from: Date;
  to: Date;
  seed?: number;
  peakEventsPerHour?: number;
  incidentCount?: GeneratorConfig["incidentCount"];
  chunkSize?: number;
  /** Refresh usage_rollup_hourly/daily over [from, to] after inserting. Default true. */
  refreshAggregates?: boolean;
  onProgress?: (insertedSoFar: number) => void;
}

export interface BackfillResult {
  insertedRows: number;
}

// Shared by the seed-data CLI's `backfill` command and apps/api's demo
// refresh job — same chunked-insert + cost-calc + aggregate-refresh logic,
// two callers (a manual one-off tool and an automatic recurring job).
export async function backfillRange(options: BackfillRangeOptions): Promise<BackfillResult> {
  const { projectId, orgId, from, to, seed, peakEventsPerHour, incidentCount } = options;
  const chunkSize = options.chunkSize ?? 2000;
  const refreshAggregates = options.refreshAggregates ?? true;

  // Imported lazily: these pull in @llmlens/db's Postgres client, which
  // requires DATABASE_URL — callers that only generate/stream events (no DB
  // write) have no DB dependency at all, and failing fast there would be a
  // bad default.
  const { db } = await import("@llmlens/db");
  const { usageEvents } = await import("@llmlens/db/schema");
  const { DEMO_MODEL_PRICING, calculateCostUsd } = await import("@llmlens/shared-types");

  const pricingByKey = new Map(
    DEMO_MODEL_PRICING.map((p) => [`${p.provider}:${p.model}`, p] as const),
  );

  let chunk: (typeof usageEvents.$inferInsert)[] = [];
  let totalInserted = 0;

  async function flush() {
    if (chunk.length === 0) return;
    await db.insert(usageEvents).values(chunk);
    totalInserted += chunk.length;
    chunk = [];
    options.onProgress?.(totalInserted);
  }

  for (const event of generateEvents({ from, to, seed, peakEventsPerHour, incidentCount })) {
    const pricing = pricingByKey.get(`${event.provider}:${event.model}`) ?? null;
    chunk.push({
      projectId,
      orgId,
      occurredAt: new Date(event.occurredAt),
      provider: event.provider,
      model: event.model,
      operation: event.operation,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      totalTokens: event.totalTokens,
      costUsd: pricing
        ? calculateCostUsd(pricing, event.promptTokens, event.completionTokens).toFixed(8)
        : null,
      latencyMs: event.latencyMs ?? null,
      status: event.status,
      errorType: event.errorType ?? null,
      tags: event.tags ?? {},
      requestId: event.requestId ?? null,
      userIdentifier: event.userIdentifier ?? null,
      metadata: event.metadata ?? {},
    });
    if (chunk.length >= chunkSize) await flush();
  }
  await flush();

  if (refreshAggregates) {
    // Continuous-aggregate refresh *policies* only ever refresh a recent
    // sliding window (see packages/db/src/manual-sql/0001_hypertable.sql) —
    // they will never touch historical data backfilled here, so the
    // rollups would otherwise silently stay empty for this range. Each
    // aggregate's refresh window must cover at least one full bucket or
    // Timescale rejects it ("refresh window must cover at least one bucket
    // of data") — a problem every prior caller of this function avoided by
    // always backfilling multi-day ranges, but a short top-up window (this
    // function's new caller: the demo-refresh job) can be narrower than a
    // single day bucket. refreshAggregatesOver rounds each aggregate's
    // window out to its own bucket size rather than sharing [from, to).
    await refreshAggregatesOver(from, to);
  }

  return { insertedRows: totalInserted };
}
