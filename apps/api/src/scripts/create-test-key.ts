// Dev-only helper: until Clerk auth + the dashboard's own key-management UI
// land in Week 6, this is how we get an org/project/API key to test the
// ingestion pipeline end-to-end. Not exposed as an HTTP route.
import { db } from "@llmlens/db";
import { organizations, projects, apiKeys } from "@llmlens/db/schema";
import { generateApiKey } from "../lib/auth/api-key.js";

async function main() {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Dev Org", slug: `dev-org-${Date.now()}` })
    .returning();
  if (!org) throw new Error("failed to create org");

  const [project] = await db
    .insert(projects)
    .values({ orgId: org.id, name: "Dev Project", slug: "dev-project" })
    .returning();
  if (!project) throw new Error("failed to create project");

  const { rawKey, prefix, hash } = generateApiKey();
  await db.insert(apiKeys).values({
    projectId: project.id,
    name: "dev-key",
    keyPrefix: prefix,
    keyHash: hash,
  });

  console.log("org:", org.id);
  console.log("project:", project.id);
  console.log("API key (save this, shown once):", rawKey);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
