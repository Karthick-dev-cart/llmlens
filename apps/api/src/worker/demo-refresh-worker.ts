import { Worker } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";
import { DEMO_REFRESH_QUEUE } from "../queue/demo-refresh-queue.js";
import { refreshDemoProject } from "../lib/demo/refresh.js";

export function startDemoRefreshWorker() {
  // concurrency 1 — same reasoning as budget-check: this and the immediate
  // kickoff job in scheduleDemoRefresh could otherwise race on startup.
  const worker = new Worker(
    DEMO_REFRESH_QUEUE,
    async () => refreshDemoProject(),
    { connection: createRedisConnection(), concurrency: 1 },
  );

  worker.on("completed", (_job, result: { insertedRows: number }) => {
    console.log(`demo-refresh: inserted ${result.insertedRows} row(s)`);
  });

  worker.on("failed", (job, err) => {
    console.error(`demo-refresh job ${job?.id} failed:`, err);
  });

  return worker;
}
