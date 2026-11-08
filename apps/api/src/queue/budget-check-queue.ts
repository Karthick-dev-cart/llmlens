import { Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";

export const BUDGET_CHECK_QUEUE = "budget-check";

export const budgetCheckQueue = new Queue(BUDGET_CHECK_QUEUE, {
  connection: createRedisConnection(),
});

const BUDGET_CHECK_INTERVAL_MS = 60_000;

// Idempotent: BullMQ keys repeatable jobs by their repeat pattern + jobId, so
// calling this on every worker boot doesn't create duplicate schedules.
export async function scheduleBudgetChecks(): Promise<void> {
  await budgetCheckQueue.add(
    "check",
    {},
    { repeat: { every: BUDGET_CHECK_INTERVAL_MS }, jobId: "budget-check-repeatable" },
  );
}
