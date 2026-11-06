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
}
