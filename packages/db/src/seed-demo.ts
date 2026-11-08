import { DEMO_ORG_ID, DEMO_PROJECT_ID } from "@llmlens/shared-types";
import { db } from "./client.js";
import { organizations, projects } from "./schema/index.js";

// Idempotent: only ever creates the demo org/project *rows*, on fixed IDs.
// Seeding the demo project's usage_events is a separate, ongoing concern
// owned by apps/api's demo-refresh job (see worker/demo-refresh-worker.ts)
// — keeping exactly one thing responsible for event seeding avoids two
// code paths racing to double-seed on a restart.
async function main() {
  await db
    .insert(organizations)
    .values({ id: DEMO_ORG_ID, name: "LLMLens Public Demo", slug: "llmlens-public-demo" })
    .onConflictDoNothing();

  await db
    .insert(projects)
    .values({
      id: DEMO_PROJECT_ID,
      orgId: DEMO_ORG_ID,
      name: "Public Demo",
      slug: "public-demo",
    })
    .onConflictDoNothing();

  console.log(`Demo org ${DEMO_ORG_ID} / project ${DEMO_PROJECT_ID} ready.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
