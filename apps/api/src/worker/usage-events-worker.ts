import { Worker, type Job } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";
import { db } from "../db/client.js";
import { usageEvents } from "../db/schema/index.js";
import { lookupPricing } from "../lib/pricing/pricing-lookup.js";
import { calculateCostUsd } from "../lib/pricing/cost.js";
import { USAGE_EVENTS_QUEUE, type UsageEventsJobData } from "../queue/index.js";

// Pricing is grouped by (provider, model) within a batch and looked up once
// per group rather than once per event — events in a single ingestion batch
// are near-realtime, so using the first event's timestamp as the pricing
// lookup anchor for the whole group is an acceptable approximation that
// avoids N pricing queries for N events.
async function resolveCostsForBatch(data: UsageEventsJobData) {
  const groups = new Map<string, { provider: string; model: string; occurredAt: Date }>();
  for (const event of data.events) {
    const key = `${event.provider}:${event.model}`;
    if (!groups.has(key)) {
      groups.set(key, {
        provider: event.provider,
        model: event.model,
        occurredAt: new Date(event.occurredAt),
      });
    }
  }

  const pricingByKey = new Map<string, Awaited<ReturnType<typeof lookupPricing>>>();
  for (const [key, group] of groups) {
    pricingByKey.set(key, await lookupPricing(group.provider, group.model, group.occurredAt));
  }

  return data.events.map((event) => {
    const pricing = pricingByKey.get(`${event.provider}:${event.model}`) ?? null;
    const costUsd = calculateCostUsd(pricing, event.promptTokens, event.completionTokens);
    return {
      projectId: data.projectId,
      orgId: data.orgId,
      occurredAt: new Date(event.occurredAt),
      provider: event.provider,
      model: event.model,
      operation: event.operation,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      totalTokens: event.totalTokens,
      costUsd: costUsd.toFixed(8),
      latencyMs: event.latencyMs ?? null,
      status: event.status,
      errorType: event.errorType ?? null,
      tags: event.tags ?? {},
      requestId: event.requestId ?? null,
      userIdentifier: event.userIdentifier ?? null,
      metadata: event.metadata ?? {},
    };
  });
}

export function startUsageEventsWorker() {
  const worker = new Worker<UsageEventsJobData>(
    USAGE_EVENTS_QUEUE,
    async (job: Job<UsageEventsJobData>) => {
      const rows = await resolveCostsForBatch(job.data);
      await db.insert(usageEvents).values(rows);
      return { inserted: rows.length };
    },
    { connection: createRedisConnection(), concurrency: 5 },
  );

  worker.on("completed", (job, result) => {
    console.log(`job ${job.id} inserted ${result.inserted} events`);
  });

  worker.on("failed", (job, err) => {
    console.error(`usage-events job ${job?.id} failed:`, err);
  });

  return worker;
}
