import { startUsageEventsWorker } from "./usage-events-worker.js";
import { startBudgetCheckWorker } from "./budget-check-worker.js";
import { scheduleBudgetChecks } from "../queue/budget-check-queue.js";

const worker = startUsageEventsWorker();
console.log("usage-events worker started");

const budgetCheckWorker = startBudgetCheckWorker();
await scheduleBudgetChecks();
console.log("budget-check worker started");

process.on("SIGTERM", async () => {
  await worker.close();
  await budgetCheckWorker.close();
  process.exit(0);
});
