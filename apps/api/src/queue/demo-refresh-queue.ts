import { Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";

export const DEMO_REFRESH_QUEUE = "demo-refresh";

export const demoRefreshQueue = new Queue(DEMO_REFRESH_QUEUE, {
  connection: createRedisConnection(),
});

const DEMO_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

// Idempotent, same as budget-check-queue: safe to call on every worker boot.
// Also enqueues one immediate one-off run so a fresh deploy doesn't leave
// the public demo empty for up to a full interval before its first seed.
export async function scheduleDemoRefresh(): Promise<void> {
  await demoRefreshQueue.add("refresh", {});
  await demoRefreshQueue.add(
    "refresh",
    {},
    { repeat: { every: DEMO_REFRESH_INTERVAL_MS }, jobId: "demo-refresh-repeatable" },
  );
}
