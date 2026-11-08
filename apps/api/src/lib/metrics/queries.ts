import { sql } from "drizzle-orm";
import { db } from "@llmlens/db";
import { startOfUtcDay } from "@llmlens/shared-types";

// Shared by the authenticated /v1/projects/:id/metrics/* routes and the
// public /v1/demo/* routes — same query logic, different auth/tenancy
// wrapper around the projectId each call site supplies.

export function parseRange(query: unknown): { from: string; to: string } {
  const q = query as { from?: string; to?: string };
  const to = q.to ?? new Date().toISOString();
  const from = q.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  // bucket values are day-truncated, so a precise (non-midnight) `from`
  // would exclude that whole day's bucket row (bucket 00:00 < from 15:02).
  return { from: startOfUtcDay(from), to };
}

interface SummaryRow {
  [key: string]: unknown;
  total_cost: string | null;
  total_tokens: string | null;
  total_events: string | null;
  total_errors: string | null;
}

export interface MetricsSummary {
  from: string;
  to: string;
  totalCostUsd: number;
  totalTokens: number;
  totalEvents: number;
  totalErrors: number;
}

export async function getSummary(
  projectId: string,
  from: string,
  to: string,
): Promise<MetricsSummary> {
  const [row] = await db.execute<SummaryRow>(sql`
    SELECT
      sum(total_cost_usd) AS total_cost,
      sum(total_tokens) AS total_tokens,
      sum(event_count) AS total_events,
      sum(error_count) AS total_errors
    FROM usage_rollup_daily
    WHERE project_id = ${projectId} AND bucket >= ${from} AND bucket < ${to}
  `);

  return {
    from,
    to,
    totalCostUsd: Number(row?.total_cost ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
    totalEvents: Number(row?.total_events ?? 0),
    totalErrors: Number(row?.total_errors ?? 0),
  };
}

interface TimeseriesRow {
  [key: string]: unknown;
  bucket: string;
  total_cost: string | null;
  total_tokens: string | null;
  total_events: string | null;
  total_errors: string | null;
}

export interface MetricsTimeseries {
  from: string;
  to: string;
  series: {
    date: string;
    costUsd: number;
    tokens: number;
    events: number;
    errors: number;
  }[];
}

export async function getTimeseries(
  projectId: string,
  from: string,
  to: string,
): Promise<MetricsTimeseries> {
  const rows = await db.execute<TimeseriesRow>(sql`
    SELECT
      bucket,
      sum(total_cost_usd) AS total_cost,
      sum(total_tokens) AS total_tokens,
      sum(event_count) AS total_events,
      sum(error_count) AS total_errors
    FROM usage_rollup_daily
    WHERE project_id = ${projectId} AND bucket >= ${from} AND bucket < ${to}
    GROUP BY bucket
    ORDER BY bucket
  `);

  return {
    from,
    to,
    series: rows.map((r) => ({
      date: new Date(r.bucket).toISOString().slice(0, 10),
      costUsd: Number(r.total_cost ?? 0),
      tokens: Number(r.total_tokens ?? 0),
      events: Number(r.total_events ?? 0),
      errors: Number(r.total_errors ?? 0),
    })),
  };
}

interface BreakdownRow {
  [key: string]: unknown;
  key: string | null;
  total_cost: string | null;
  total_tokens: string | null;
  total_events: string | null;
  total_errors: string | null;
}

export const BREAKDOWN_DIMENSIONS = ["model", "provider", "status", "feature"] as const;
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export interface BreakdownResponse {
  dimension: BreakdownDimension;
  from: string;
  to: string;
  breakdown: {
    key: string;
    costUsd: number;
    tokens: number;
    events: number;
    errors: number;
  }[];
}

export function parseBreakdownDimension(query: unknown): BreakdownDimension {
  const q = query as { dimension?: string };
  return (BREAKDOWN_DIMENSIONS as readonly string[]).includes(q.dimension ?? "")
    ? (q.dimension as BreakdownDimension)
    : "model";
}

export async function getBreakdown(
  projectId: string,
  dimension: BreakdownDimension,
  from: string,
  to: string,
): Promise<BreakdownResponse> {
  let rows: BreakdownRow[];
  if (dimension === "feature") {
    // Tags are an arbitrary per-event key/value jsonb blob, not rolled up
    // into usage_rollup_daily, so this is a bounded raw-table scan rather
    // than the rollup query the other dimensions use below. "feature" is
    // the only tag key the SDK/seed data populate today — a generic
    // tag-key picker is future scope once a second key exists.
    rows = await db.execute<BreakdownRow>(sql`
      SELECT
        tags->>'feature' AS key,
        sum(cost_usd) AS total_cost,
        sum(total_tokens) AS total_tokens,
        count(*) AS total_events,
        count(*) FILTER (WHERE status = 'error') AS total_errors
      FROM usage_events
      WHERE project_id = ${projectId} AND occurred_at >= ${from} AND occurred_at < ${to}
      GROUP BY key
    `);
  } else {
    // dimension is restricted to BREAKDOWN_DIMENSIONS by parseBreakdownDimension,
    // so this raw column interpolation can't be used for injection.
    const column = sql.raw(dimension);
    rows = await db.execute<BreakdownRow>(sql`
      SELECT
        ${column} AS key,
        sum(total_cost_usd) AS total_cost,
        sum(total_tokens) AS total_tokens,
        sum(event_count) AS total_events,
        sum(error_count) AS total_errors
      FROM usage_rollup_daily
      WHERE project_id = ${projectId} AND bucket >= ${from} AND bucket < ${to}
      GROUP BY ${column}
    `);
  }

  const breakdown = rows
    .map((r) => ({
      key: r.key ?? "(none)",
      costUsd: Number(r.total_cost ?? 0),
      tokens: Number(r.total_tokens ?? 0),
      events: Number(r.total_events ?? 0),
      errors: Number(r.total_errors ?? 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return { dimension, from, to, breakdown };
}

interface LatencyRow {
  [key: string]: unknown;
  p50: string | null;
  p95: string | null;
  avg_latency: string | null;
  sample_count: string | null;
}

export interface LatencyMetrics {
  from: string;
  to: string;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgLatencyMs: number | null;
  sampleCount: number;
}

export async function getLatency(
  projectId: string,
  from: string,
  to: string,
): Promise<LatencyMetrics> {
  // percentile_cont is an ordered-set aggregate and isn't supported inside
  // timescaledb.continuous views (see manual-sql/0001_hypertable.sql), so
  // this is a bounded raw-table scan rather than a rollup read.
  const [row] = await db.execute<LatencyRow>(sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
      avg(latency_ms) AS avg_latency,
      count(latency_ms) AS sample_count
    FROM usage_events
    WHERE project_id = ${projectId} AND occurred_at >= ${from} AND occurred_at < ${to}
      AND latency_ms IS NOT NULL
  `);

  return {
    from,
    to,
    p50LatencyMs: row?.p50 != null ? Math.round(Number(row.p50)) : null,
    p95LatencyMs: row?.p95 != null ? Math.round(Number(row.p95)) : null,
    avgLatencyMs: row?.avg_latency != null ? Math.round(Number(row.avg_latency)) : null,
    sampleCount: Number(row?.sample_count ?? 0),
  };
}
