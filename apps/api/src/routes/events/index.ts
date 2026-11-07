import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "@llmlens/db";
import { verifySessionAuth } from "../../lib/auth/verify-session.js";
import { assertProjectAccess } from "../../lib/projects/access.js";

interface EventRow {
  [key: string]: unknown;
  id: string;
  occurred_at: string;
  provider: string;
  model: string;
  operation: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: string | null;
  latency_ms: number | null;
  status: string;
  error_type: string | null;
  tags: Record<string, string> | null;
}

function encodeCursor(occurredAtIso: string, id: string): string {
  return Buffer.from(`${occurredAtIso}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { occurredAt: string; id: string } | null {
  try {
    const [occurredAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!occurredAt || !id) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

export async function eventsRoutes(app: FastifyInstance) {
  app.get("/v1/projects/:id/events", { preHandler: verifySessionAuth }, async (request, reply) => {
    const ctx = request.sessionContext!;
    const { id } = request.params as { id: string };
    const project = await assertProjectAccess(id, ctx.orgIds);
    if (!project) return reply.code(404).send({ error: "not_found" });

    const q = request.query as {
      from?: string;
      to?: string;
      model?: string;
      provider?: string;
      status?: string;
      limit?: string;
      cursor?: string;
    };
    const to = q.to ?? new Date().toISOString();
    const from = q.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;

    const rows = await db.execute<EventRow>(sql`
      SELECT id, occurred_at, provider, model, operation, prompt_tokens,
             completion_tokens, total_tokens, cost_usd, latency_ms, status,
             error_type, tags
      FROM usage_events
      WHERE project_id = ${id}
        AND occurred_at >= ${from} AND occurred_at < ${to}
        ${q.model ? sql`AND model = ${q.model}` : sql``}
        ${q.provider ? sql`AND provider = ${q.provider}` : sql``}
        ${q.status ? sql`AND status = ${q.status}` : sql``}
        ${
          cursor
            ? sql`AND (occurred_at, id) < (${cursor.occurredAt}::timestamptz, ${cursor.id}::uuid)`
            : sql``
        }
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${limit}
    `);

    const events = rows.map((r) => ({
      id: r.id,
      occurredAt: new Date(r.occurred_at).toISOString(),
      provider: r.provider,
      model: r.model,
      operation: r.operation,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      costUsd: r.cost_usd != null ? Number(r.cost_usd) : null,
      latencyMs: r.latency_ms,
      status: r.status,
      errorType: r.error_type,
      tags: r.tags ?? {},
    }));

    const last = rows[rows.length - 1];
    const nextCursor =
      rows.length === limit && last
        ? encodeCursor(new Date(last.occurred_at).toISOString(), String(last.id))
        : null;

    return reply.send({ events, nextCursor });
  });
}
