import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "@llmlens/db";
import { startOfUtcDay } from "@llmlens/shared-types";
import { verifySessionAuth } from "../../lib/auth/verify-session.js";
import { assertProjectAccess } from "../../lib/projects/access.js";

function parseRange(query: unknown): { from: string; to: string } {
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

interface TimeseriesRow {
  [key: string]: unknown;
  bucket: string;
  total_cost: string | null;
  total_tokens: string | null;
  total_events: string | null;
  total_errors: string | null;
}

interface BreakdownRow {
  [key: string]: unknown;
  key: string | null;
  total_cost: string | null;
  total_tokens: string | null;
  total_events: string | null;
  total_errors: string | null;
}

const BREAKDOWN_DIMENSIONS = ["model", "provider", "status", "feature"] as const;
type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

interface LatencyRow {
  [key: string]: unknown;
  p50: string | null;
  p95: string | null;
  avg_latency: string | null;
  sample_count: string | null;
}

export async function metricsRoutes(app: FastifyInstance) {
  app.get(
    "/v1/projects/:id/metrics/summary",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id } = request.params as { id: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const { from, to } = parseRange(request.query);
      const [row] = await db.execute<SummaryRow>(sql`
        SELECT
          sum(total_cost_usd) AS total_cost,
          sum(total_tokens) AS total_tokens,
          sum(event_count) AS total_events,
          sum(error_count) AS total_errors
        FROM usage_rollup_daily
        WHERE project_id = ${id} AND bucket >= ${from} AND bucket < ${to}
      `);

      return reply.send({
        from,
        to,
        totalCostUsd: Number(row?.total_cost ?? 0),
        totalTokens: Number(row?.total_tokens ?? 0),
        totalEvents: Number(row?.total_events ?? 0),
        totalErrors: Number(row?.total_errors ?? 0),
      });
    },
  );

  app.get(
    "/v1/projects/:id/metrics/timeseries",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id } = request.params as { id: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const { from, to } = parseRange(request.query);
      const rows = await db.execute<TimeseriesRow>(sql`
        SELECT
          bucket,
          sum(total_cost_usd) AS total_cost,
          sum(total_tokens) AS total_tokens,
          sum(event_count) AS total_events,
          sum(error_count) AS total_errors
        FROM usage_rollup_daily
        WHERE project_id = ${id} AND bucket >= ${from} AND bucket < ${to}
        GROUP BY bucket
        ORDER BY bucket
      `);

      return reply.send({
        from,
        to,
        series: rows.map((r) => ({
          date: new Date(r.bucket).toISOString().slice(0, 10),
          costUsd: Number(r.total_cost ?? 0),
          tokens: Number(r.total_tokens ?? 0),
          events: Number(r.total_events ?? 0),
          errors: Number(r.total_errors ?? 0),
        })),
      });
    },
  );

  app.get(
    "/v1/projects/:id/metrics/breakdown",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id } = request.params as { id: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const q = request.query as { dimension?: string };
      const dimension: BreakdownDimension = (
        BREAKDOWN_DIMENSIONS as readonly string[]
      ).includes(q.dimension ?? "")
        ? (q.dimension as BreakdownDimension)
        : "model";
      const { from, to } = parseRange(request.query);

      let rows: BreakdownRow[];
      if (dimension === "feature") {
        // Tags are an arbitrary per-event key/value jsonb blob, not rolled
        // up into usage_rollup_daily, so this is a bounded raw-table scan
        // rather than the rollup query the other dimensions use below.
        // "feature" is the only tag key the SDK/seed data populate today —
        // a generic tag-key picker is future scope once a second key exists.
        rows = await db.execute<BreakdownRow>(sql`
          SELECT
            tags->>'feature' AS key,
            sum(cost_usd) AS total_cost,
            sum(total_tokens) AS total_tokens,
            count(*) AS total_events,
            count(*) FILTER (WHERE status = 'error') AS total_errors
          FROM usage_events
          WHERE project_id = ${id} AND occurred_at >= ${from} AND occurred_at < ${to}
          GROUP BY key
        `);
      } else {
        // dimension is restricted to BREAKDOWN_DIMENSIONS above, so this
        // raw column interpolation can't be used for injection.
        const column = sql.raw(dimension);
        rows = await db.execute<BreakdownRow>(sql`
          SELECT
            ${column} AS key,
            sum(total_cost_usd) AS total_cost,
            sum(total_tokens) AS total_tokens,
            sum(event_count) AS total_events,
            sum(error_count) AS total_errors
          FROM usage_rollup_daily
          WHERE project_id = ${id} AND bucket >= ${from} AND bucket < ${to}
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

      return reply.send({ dimension, from, to, breakdown });
    },
  );

  app.get(
    "/v1/projects/:id/metrics/latency",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id } = request.params as { id: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const { from, to } = parseRange(request.query);
      // percentile_cont is an ordered-set aggregate and isn't supported
      // inside timescaledb.continuous views (see manual-sql/0001_hypertable
      // .sql), so this is a bounded raw-table scan rather than a rollup read.
      const [row] = await db.execute<LatencyRow>(sql`
        SELECT
          percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
          avg(latency_ms) AS avg_latency,
          count(latency_ms) AS sample_count
        FROM usage_events
        WHERE project_id = ${id} AND occurred_at >= ${from} AND occurred_at < ${to}
          AND latency_ms IS NOT NULL
      `);

      return reply.send({
        from,
        to,
        p50LatencyMs: row?.p50 != null ? Math.round(Number(row.p50)) : null,
        p95LatencyMs: row?.p95 != null ? Math.round(Number(row.p95)) : null,
        avgLatencyMs: row?.avg_latency != null ? Math.round(Number(row.avg_latency)) : null,
        sampleCount: Number(row?.sample_count ?? 0),
      });
    },
  );
}
