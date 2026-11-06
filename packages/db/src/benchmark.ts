import { sql } from "drizzle-orm";
import { db } from "./client.js";

// Verifies two things against whatever data is actually in the DB (not a
// fixture): the continuous aggregate agrees with a raw scan bucket-by-bucket
// (correctness), and it answers far faster (the actual performance claim).
// Run after a backfill with real volume for a meaningful number.

interface BucketRow {
  [key: string]: unknown;
  bucket: string;
  cost: string;
  events: string;
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(1)}ms`);
  return { result, ms };
}

async function main() {
  const projectArg = process.argv[2];
  const projectId =
    projectArg ??
    (
      await db.execute<{ project_id: string }>(
        sql`SELECT project_id FROM usage_events GROUP BY project_id ORDER BY count(*) DESC LIMIT 1`,
      )
    )[0]?.project_id;
  if (!projectId) throw new Error("no usage_events found — run a backfill first");

  const [range] = await db.execute<{ min_at: string; max_at: string }>(
    sql`SELECT min(occurred_at) AS min_at, max(occurred_at) AS max_at FROM usage_events WHERE project_id = ${projectId}`,
  );
  if (!range) throw new Error(`no usage_events found for project ${projectId}`);
  // Align to whole-day boundaries up front so both queries cover identical
  // calendar days — otherwise a partial first/last day reads as a mismatch
  // that isn't one.
  const from = `${range.min_at.slice(0, 10)}T00:00:00Z`;
  const toExclusive = new Date(
    new Date(`${range.max_at.slice(0, 10)}T00:00:00Z`).getTime() + 86_400_000,
  ).toISOString();
  console.log(`project ${projectId}, range [${from}, ${toExclusive})\n`);

  // Buckets with time_bucket(), the same function the continuous aggregate
  // itself uses — a correctness oracle should use the same bucketing
  // definition as the thing under test, not a second one (date_trunc) that
  // happens to agree only because this session's timezone is UTC.
  const { result: rawRows, ms: rawMs } = await timed("raw scan  (usage_events)", () =>
    db.execute<BucketRow>(sql`
      SELECT time_bucket('1 day', occurred_at) AS bucket, sum(cost_usd) AS cost, count(*) AS events
      FROM usage_events
      WHERE project_id = ${projectId} AND occurred_at >= ${from} AND occurred_at < ${toExclusive}
      GROUP BY bucket
    `),
  );

  const { result: rollupRows, ms: rollupMs } = await timed("rollup    (usage_rollup_daily)", () =>
    db.execute<BucketRow>(sql`
      SELECT bucket, sum(total_cost_usd) AS cost, sum(event_count) AS events
      FROM usage_rollup_daily
      WHERE project_id = ${projectId} AND bucket >= ${from} AND bucket < ${toExclusive}
      GROUP BY bucket
    `),
  );

  const byBucket = <T extends BucketRow>(rows: T[]) =>
    new Map(rows.map((r) => [new Date(r.bucket).toISOString(), r]));
  const rawByBucket = byBucket(rawRows);
  const rollupByBucket = byBucket(rollupRows);

  const allBuckets = new Set([...rawByBucket.keys(), ...rollupByBucket.keys()]);
  const mismatches: string[] = [];
  for (const bucket of allBuckets) {
    const raw = rawByBucket.get(bucket);
    const rollup = rollupByBucket.get(bucket);
    if (!raw || !rollup) {
      mismatches.push(`${bucket}: present in ${raw ? "raw only" : "rollup only"}`);
      continue;
    }
    const costDiff = Math.abs(Number(raw.cost) - Number(rollup.cost));
    const eventsDiff = Number(raw.events) !== Number(rollup.events);
    if (costDiff > 0.01 || eventsDiff) {
      mismatches.push(
        `${bucket}: raw cost=${raw.cost} events=${raw.events} vs rollup cost=${rollup.cost} events=${rollup.events}`,
      );
    }
  }

  console.log(`\ncompared ${allBuckets.size} daily buckets`);
  if (mismatches.length > 0) {
    console.error(`\nMISMATCH in ${mismatches.length} bucket(s):`);
    for (const m of mismatches.slice(0, 10)) console.error(`  ${m}`);
    process.exit(1);
  }

  console.log(`correctness: OK — rollup matches raw table exactly, bucket by bucket`);
  console.log(
    `speedup: ${(rawMs / rollupMs).toFixed(1)}x (${rawMs.toFixed(1)}ms -> ${rollupMs.toFixed(1)}ms)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
