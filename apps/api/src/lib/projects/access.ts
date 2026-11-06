import { eq } from "drizzle-orm";
import { db } from "@llmlens/db";
import { projects } from "@llmlens/db/schema";

export async function assertProjectAccess(projectId: string, orgIds: string[]) {
  if (orgIds.length === 0) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || !orgIds.includes(project.orgId)) return null;
  return project;
}
