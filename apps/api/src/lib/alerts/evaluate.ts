import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@llmlens/db";
import { budgets, alertEvents } from "@llmlens/db/schema";
import { periodStart } from "./period.js";
import { sendAlert } from "./channels.js";

interface SpendRow {
  [key: string]: unknown;
  total_cost: string | null;
}

export async function currentSpendUsd(projectId: string, period: string, now: Date): Promise<number> {
  const start = periodStart(period, now);
  const [row] = await db.execute<SpendRow>(sql`
    SELECT sum(total_cost_usd) AS total_cost
    FROM usage_rollup_daily
    WHERE project_id = ${projectId} AND bucket >= ${start.toISOString()}
  `);
  return Number(row?.total_cost ?? 0);
}

// Runs on a repeatable schedule (see queue/budget-check-queue.ts), not per
// ingested event — keeps alerting off the hot ingestion path, same reasoning
// as the async BullMQ ingestion pipeline itself.
export async function evaluateBudgets(): Promise<{ checked: number; alertsSent: number }> {
  const now = new Date();
  const allBudgets = await db.select().from(budgets);
  let alertsSent = 0;

  for (const budget of allBudgets) {
    const threshold = Number(budget.thresholdUsd);
    const spend = await currentSpendUsd(budget.projectId, budget.period, now);
    if (spend < threshold) continue;

    // One alert per budget per period: skip if we've already logged an
    // alert_events row triggered since this period started.
    const start = periodStart(budget.period, now);
    const [existing] = await db
      .select({ id: alertEvents.id })
      .from(alertEvents)
      .where(and(eq(alertEvents.budgetId, budget.id), gte(alertEvents.triggeredAt, start)))
      .limit(1);
    if (existing) continue;

    await db.insert(alertEvents).values({
      budgetId: budget.id,
      valueAtTrigger: spend.toFixed(2),
    });

    await sendAlert(budget.channelConfig ?? {}, {
      projectId: budget.projectId,
      period: budget.period,
      thresholdUsd: threshold,
      spendUsd: spend,
    });
    alertsSent += 1;
  }

  return { checked: allBudgets.length, alertsSent };
}
