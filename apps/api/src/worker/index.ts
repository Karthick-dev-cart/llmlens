import { startUsageEventsWorker } from "./usage-events-worker.js";
import { startBudgetCheckWorker } from "./budget-check-worker.js";
import { scheduleBudgetChecks } from "../queue/budget-check-queue.js";
import { startDemoRefreshWorker } from "./demo-refresh-worker.js";
import { scheduleDemoRefresh } from "../queue/demo-refresh-queue.js";

const worker = startUsageEventsWorker();
console.log("usage-events worker started");

const budgetCheckWorker = startBudgetCheckWorker();
await scheduleBudgetChecks();
console.log("budget-check worker started");

const demoRefreshWorker = startDemoRefreshWorker();
await scheduleDemoRefresh();
console.log("demo-refresh worker started");

process.on("SIGTERM", async () => {
  await worker.close();
  await budgetCheckWorker.close();
  await demoRefreshWorker.close();
  process.exit(0);
});
