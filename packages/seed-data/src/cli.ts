#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createWriteStream } from "node:fs";
import { generateEvents } from "./generator.js";
import type { UsageEventInput } from "@llmlens/shared-types";

function requireArg(values: Record<string, unknown>, name: string): string {
  const v = values[name];
  if (typeof v !== "string") throw new Error(`--${name} is required`);
  return v;
}

function parseDateArg(values: Record<string, unknown>, name: string): Date {
  const raw = requireArg(values, name);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`--${name} is not a valid date: ${raw}`);
  return date;
}

async function cmdGenerate(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      out: { type: "string" },
      seed: { type: "string" },
      "peak-per-hour": { type: "string" },
    },
  });

  const from = parseDateArg(values, "from");
  const to = parseDateArg(values, "to");
  const out = requireArg(values, "out");
  const seed = values.seed ? Number(values.seed) : undefined;
  const peakEventsPerHour = values["peak-per-hour"] ? Number(values["peak-per-hour"]) : undefined;

  const stream = createWriteStream(out, { encoding: "utf-8" });
  let count = 0;
  for (const event of generateEvents({ from, to, seed, peakEventsPerHour })) {
    stream.write(JSON.stringify(event) + "\n");
    count++;
  }
  stream.end();
  console.log(`Wrote ${count} events to ${out}`);
}

async function cmdLoad(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      api: { type: "string" },
      key: { type: "string" },
      seed: { type: "string" },
      "peak-per-hour": { type: "string" },
      "batch-size": { type: "string" },
    },
  });

  const from = parseDateArg(values, "from");
  const to = parseDateArg(values, "to");
  const api = requireArg(values, "api");
  const key = requireArg(values, "key");
  const seed = values.seed ? Number(values.seed) : undefined;
  const peakEventsPerHour = values["peak-per-hour"] ? Number(values["peak-per-hour"]) : undefined;
  const batchSize = values["batch-size"] ? Number(values["batch-size"]) : 500;

  let batch: UsageEventInput[] = [];
  let totalSent = 0;
  const startedAt = Date.now();

  async function flush() {
    if (batch.length === 0) return;
    const res = await fetch(`${api}/v1/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) {
      throw new Error(`ingest batch failed: ${res.status} ${await res.text()}`);
    }
    totalSent += batch.length;
    batch = [];
  }

  for (const event of generateEvents({ from, to, seed, peakEventsPerHour })) {
    batch.push(event);
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  const elapsedSec = (Date.now() - startedAt) / 1000;
  console.log(
    `Sent ${totalSent} events via HTTP in ${elapsedSec.toFixed(1)}s (${(totalSent / elapsedSec).toFixed(1)} events/sec)`,
  );
}

async function cmdBackfill(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      project: { type: "string" },
      org: { type: "string" },
      seed: { type: "string" },
      "peak-per-hour": { type: "string" },
      "chunk-size": { type: "string" },
    },
  });

  const from = parseDateArg(values, "from");
  const to = parseDateArg(values, "to");
  const projectId = requireArg(values, "project");
  const orgId = requireArg(values, "org");
  const seed = values.seed ? Number(values.seed) : undefined;
  const peakEventsPerHour = values["peak-per-hour"] ? Number(values["peak-per-hour"]) : undefined;
  const chunkSize = values["chunk-size"] ? Number(values["chunk-size"]) : 2000;

  // Imported lazily: these pull in @llmlens/db's Postgres client, which
  // requires DATABASE_URL — the generate/load commands have no DB
  // dependency at all, and failing fast there would be a bad default.
  const { db } = await import("@llmlens/db");
  const { usageEvents } = await import("@llmlens/db/schema");
  const { DEMO_MODEL_PRICING, calculateCostUsd } = await import("@llmlens/shared-types");

  const pricingByKey = new Map(
    DEMO_MODEL_PRICING.map((p) => [`${p.provider}:${p.model}`, p] as const),
  );

  let chunk: (typeof usageEvents.$inferInsert)[] = [];
  let totalInserted = 0;
  const startedAt = Date.now();

  async function flush() {
    if (chunk.length === 0) return;
    await db.insert(usageEvents).values(chunk);
    totalInserted += chunk.length;
    chunk = [];
    const elapsedSec = (Date.now() - startedAt) / 1000;
    console.log(`  inserted ${totalInserted} rows (${(totalInserted / elapsedSec).toFixed(0)}/sec)`);
  }

  for (const event of generateEvents({ from, to, seed, peakEventsPerHour })) {
    const pricing = pricingByKey.get(`${event.provider}:${event.model}`) ?? null;
    chunk.push({
      projectId,
      orgId,
      occurredAt: new Date(event.occurredAt),
      provider: event.provider,
      model: event.model,
      operation: event.operation,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      totalTokens: event.totalTokens,
      costUsd: pricing
        ? calculateCostUsd(pricing, event.promptTokens, event.completionTokens).toFixed(8)
        : null,
      latencyMs: event.latencyMs ?? null,
      status: event.status,
      errorType: event.errorType ?? null,
      tags: event.tags ?? {},
      requestId: event.requestId ?? null,
      userIdentifier: event.userIdentifier ?? null,
      metadata: event.metadata ?? {},
    });
    if (chunk.length >= chunkSize) await flush();
  }
  await flush();

  const elapsedSec = (Date.now() - startedAt) / 1000;
  console.log(
    `Backfilled ${totalInserted} rows in ${elapsedSec.toFixed(1)}s (${(totalInserted / elapsedSec).toFixed(0)} rows/sec)`,
  );
  process.exit(0);
}

const [command, ...rest] = process.argv.slice(2);

const handlers: Record<string, (argv: string[]) => Promise<void>> = {
  generate: cmdGenerate,
  load: cmdLoad,
  backfill: cmdBackfill,
};

const handler = command ? handlers[command] : undefined;
if (!handler) {
  console.error("Usage: llmlens-seed <generate|load|backfill> [options]");
  process.exit(1);
}

handler(rest).catch((err) => {
  console.error(err);
  process.exit(1);
});
