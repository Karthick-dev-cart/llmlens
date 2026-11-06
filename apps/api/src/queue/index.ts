import { Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";
import type { UsageEventInput } from "@llmlens/shared-types";

export const USAGE_EVENTS_QUEUE = "usage-events";

export interface UsageEventsJobData {
  projectId: string;
  orgId: string;
  events: UsageEventInput[];
}

export const usageEventsQueue = new Queue<UsageEventsJobData>(USAGE_EVENTS_QUEUE, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});
