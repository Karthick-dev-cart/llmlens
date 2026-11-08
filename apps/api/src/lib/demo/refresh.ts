import { sql } from "drizzle-orm";
import { db } from "@llmlens/db";
import { backfillRange } from "@llmlens/seed-data";
import { DEMO_ORG_ID, DEMO_PROJECT_ID } from "@llmlens/shared-types";

const INITIAL_HISTORY_DAYS = 30;
// If the job hasn't run in longer than this (box was off, first deploy
// after a long gap), cap the catch-up instead of generating a huge backlog
// in one go — the next run picks up where this one leaves off.
const MAX_CATCHUP_DAYS = 3;

interface MaxOccurredAtRow {
  [key: string]: unknown;
  max_at: string | null;
}

// The demo-refresh job is the *only* writer of demo-project events — the
// seed-demo script (packages/db/src/seed-demo.ts) only ever creates the
// org/project rows, never events, so there's exactly one code path that
// can seed data and a restart can't double-seed.
export async function refreshDemoProject(): Promise<{ insertedRows: number }> {
  const [row] = await db.execute<MaxOccurredAtRow>(sql`
    SELECT max(occurred_at) AS max_at FROM usage_events WHERE project_id = ${DEMO_PROJECT_ID}
  `);

  const now = new Date();
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

  if (from >= now) return { insertedRows: 0 };

  const { insertedRows } = await backfillRange({
    projectId: DEMO_PROJECT_ID,
    orgId: DEMO_ORG_ID,
    from,
    to: now,
    incidentCount,
  });

  return { insertedRows };
}
