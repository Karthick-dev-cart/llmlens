import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@llmlens/db";
import { budgets, alertEvents } from "@llmlens/db/schema";
import { verifySessionAuth } from "../../lib/auth/verify-session.js";
import { assertProjectAccess } from "../../lib/projects/access.js";
import { currentSpendUsd } from "../../lib/alerts/evaluate.js";
import { isSafeWebhookUrl } from "../../lib/alerts/webhook-guard.js";

// Slack URL safety is also (and authoritatively) re-checked right before
// every send in channels.ts — this is just fail-fast UX so a bad webhook
// URL is rejected at creation time instead of silently never firing.
async function validateChannelConfig(config: unknown): Promise<boolean> {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;
  if (c.type === undefined) return true; // no channel configured yet — allowed
  if (c.type === "email") return typeof c.to === "string" && c.to.length > 0;
  if (c.type === "slack") {
    return typeof c.webhookUrl === "string" && (await isSafeWebhookUrl(c.webhookUrl));
  }
  return false;
}

export async function budgetRoutes(app: FastifyInstance) {
  app.get("/v1/projects/:id/budgets", { preHandler: verifySessionAuth }, async (request, reply) => {
    const ctx = request.sessionContext!;
    const { id } = request.params as { id: string };
    const project = await assertProjectAccess(id, ctx.orgIds);
    if (!project) return reply.code(404).send({ error: "not_found" });

    const rows = await db.select().from(budgets).where(eq(budgets.projectId, id));
    const now = new Date();
    const withSpend = await Promise.all(
      rows.map(async (budget) => ({
        id: budget.id,
        period: budget.period,
        thresholdUsd: Number(budget.thresholdUsd),
        channelConfig: budget.channelConfig,
        createdAt: budget.createdAt,
        currentSpendUsd: await currentSpendUsd(id, budget.period, now),
      })),
    );

    return reply.send({ budgets: withSpend });
  });

  app.post("/v1/projects/:id/budgets", { preHandler: verifySessionAuth }, async (request, reply) => {
    const ctx = request.sessionContext!;
    const { id } = request.params as { id: string };
    const project = await assertProjectAccess(id, ctx.orgIds);
    if (!project) return reply.code(404).send({ error: "not_found" });

    const body = request.body as {
      period?: string;
      thresholdUsd?: number;
      channelConfig?: unknown;
    };
    if (body.period !== "daily" && body.period !== "monthly") {
      return reply.code(400).send({ error: "invalid_period" });
    }
    if (typeof body.thresholdUsd !== "number" || !(body.thresholdUsd > 0)) {
      return reply.code(400).send({ error: "invalid_threshold" });
    }
    const channelConfig = (body.channelConfig ?? {}) as Record<string, unknown>;
    if (!(await validateChannelConfig(channelConfig))) {
      return reply.code(400).send({ error: "invalid_channel_config" });
    }

    const [created] = await db
      .insert(budgets)
      .values({
        projectId: id,
        period: body.period,
        thresholdUsd: body.thresholdUsd.toFixed(2),
        channelConfig,
      })
      .returning();

    return reply.code(201).send(created);
  });

  app.delete(
    "/v1/projects/:id/budgets/:budgetId",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id, budgetId } = request.params as { id: string; budgetId: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      await db.delete(budgets).where(and(eq(budgets.id, budgetId), eq(budgets.projectId, id)));
      return reply.code(204).send();
    },
  );

  app.get("/v1/projects/:id/alerts", { preHandler: verifySessionAuth }, async (request, reply) => {
    const ctx = request.sessionContext!;
    const { id } = request.params as { id: string };
    const project = await assertProjectAccess(id, ctx.orgIds);
    if (!project) return reply.code(404).send({ error: "not_found" });

    const rows = await db
      .select({
        id: alertEvents.id,
        budgetId: alertEvents.budgetId,
        triggeredAt: alertEvents.triggeredAt,
        valueAtTrigger: alertEvents.valueAtTrigger,
        period: budgets.period,
        thresholdUsd: budgets.thresholdUsd,
      })
      .from(alertEvents)
      .innerJoin(budgets, eq(budgets.id, alertEvents.budgetId))
      .where(eq(budgets.projectId, id))
      .orderBy(desc(alertEvents.triggeredAt))
      .limit(50);

    return reply.send({ alerts: rows });
  });
}
