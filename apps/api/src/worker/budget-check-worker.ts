import { Worker } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";
import { BUDGET_CHECK_QUEUE } from "../queue/budget-check-queue.js";
import { evaluateBudgets } from "../lib/alerts/evaluate.js";

export function startBudgetCheckWorker() {
  const worker = new Worker(
    BUDGET_CHECK_QUEUE,
    async () => evaluateBudgets(),
    { connection: createRedisConnection(), concurrency: 1 },
  );

  worker.on("completed", (_job, result: { checked: number; alertsSent: number }) => {
    if (result.alertsSent > 0) {
      console.log(`budget-check: ${result.alertsSent} alert(s) sent (${result.checked} budgets checked)`);
    }
  });

  worker.on("failed", (job, err) => {
    console.error(`budget-check job ${job?.id} failed:`, err);
  });

  return worker;
}
