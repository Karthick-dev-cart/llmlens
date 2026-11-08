import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@llmlens/db";
import { usageEvents } from "@llmlens/db/schema";
import { backfillRange, refreshAggregatesOver } from "@llmlens/seed-data";
import { DEMO_ORG_ID, DEMO_PROJECT_ID } from "@llmlens/shared-types";

const INITIAL_HISTORY_DAYS = 30;
// If the job hasn't run in longer than this (box was off, first deploy
// after a long gap), cap the catch-up instead of generating a huge backlog
// in one go — the next run picks up where this one leaves off.
const MAX_CATCHUP_DAYS = 3;
// The dashboard only ever queries the last 30 days — keep a buffer past that
// so a slightly-stale page view never reads as "missing data", not because
// anything needs the extra 5 days.
const RETENTION_DAYS = 35;

// usage_events is a Timescale hypertable partitioned on occurred_at only
// (see packages/db/src/manual-sql/0001_hypertable.sql), *not* on project_id —
// every real project's rows share the same chunks as the demo project's.
// That rules out drop_chunks here: a chunk covering an old timestamp holds
// every project's events for that window, not just the demo's, so dropping
// it would destroy other tenants' real data. A plain row-scoped DELETE is
// the only safe option, and apps/api/src/lib/demo/refresh.ts already does
// a project-scoped query against the usage_events_project_time_idx index.
async function pruneOldDemoEvents(now: Date): Promise<{ deletedRows: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);

  const deleted = await db
    .delete(usageEvents)
    .where(and(eq(usageEvents.projectId, DEMO_PROJECT_ID), lt(usageEvents.occurredAt, cutoff)))
    .returning({ occurredAt: usageEvents.occurredAt });

  if (deleted.length === 0) return { deletedRows: 0 };

  // Rows just deleted may still be reflected in already-materialized rollup
  // buckets — refresh the aggregates over the deleted span so the rollups
  // (what the dashboard actually reads) drop them too, same as the backfill
  // path refreshes over newly-inserted spans.
  const oldestDeleted = deleted.reduce(
    (min: Date, r) => (r.occurredAt < min ? r.occurredAt : min),
    cutoff,
  );
  await refreshAggregatesOver(oldestDeleted, cutoff);

  return { deletedRows: deleted.length };
}

interface MaxOccurredAtRow {
  [key: string]: unknown;
  max_at: string | null;
}

// The demo-refresh job is the *only* writer of demo-project events — the
// seed-demo script (packages/db/src/seed-demo.ts) only ever creates the
// org/project rows, never events, so there's exactly one code path that
// can seed data and a restart can't double-seed.
export async function refreshDemoProject(): Promise<{ insertedRows: number; deletedRows: number }> {
  const now = new Date();
  const { deletedRows } = await pruneOldDemoEvents(now);

  const [row] = await db.execute<MaxOccurredAtRow>(sql`
    SELECT max(occurred_at) AS max_at FROM usage_events WHERE project_id = ${DEMO_PROJECT_ID}
  `);

  let from: Date;
  let incidentCount: number | undefined;

  if (!row?.max_at) {
    // Empty state — seed a full history so the demo doesn't look sparse.
    from = new Date(now.getTime() - INITIAL_HISTORY_DAYS * 86_400_000);
    incidentCount = undefined; // use generateEvents' own default
  } else {
    const maxOccurredAt = new Date(row.max_at);
    const cutoff = new Date(now.getTime() - MAX_CATCHUP_DAYS * 86_400_000);
    from = maxOccurredAt > cutoff ? maxOccurredAt : cutoff;
    // Routine top-up: a short window with the default incident density
    // (tuned for multi-day ranges) would make nearly the whole window
    // read as "during an incident" and spike the error rate — confirmed
    // by dry-running generateEvents on a 3h window before wiring this up.
    incidentCount = 0;
  }

  if (from >= now) return { insertedRows: 0, deletedRows };

  const { insertedRows } = await backfillRange({
    projectId: DEMO_PROJECT_ID,
    orgId: DEMO_ORG_ID,
    from,
    to: now,
    incidentCount,
  });

  return { insertedRows, deletedRows };
}
