import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "@llmlens/db";
import { organizations, orgMembers, projects } from "@llmlens/db/schema";
import { signSession } from "../../lib/session/token.js";

// Single hardcoded identity for the dev-stub auth flow — stands in for
// whatever user a real Clerk session would resolve to. Swapping in Clerk
// later means replacing this route (and the login button that calls it)
// with real sign-in; the org_members-based tenancy it bootstraps doesn't
// change.
const DEV_USER_ID = "dev-user-1";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/dev-login", async (_request, reply) => {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      app.log.error("AUTH_SECRET is not set");
      return reply.code(500).send({ error: "server_misconfigured" });
    }

    const [existingMembership] = await db
      .select()
      .from(orgMembers)
      .where(eq(orgMembers.userId, DEV_USER_ID))
      .limit(1);

    if (!existingMembership) {
      const [org] = await db
        .insert(organizations)
        .values({ name: "Dev Org", slug: `dev-org-${Date.now()}` })
        .returning();
      if (!org) throw new Error("failed to create org");
      await db.insert(orgMembers).values({ orgId: org.id, userId: DEV_USER_ID, role: "owner" });
      await db.insert(projects).values({ orgId: org.id, name: "Dev Project", slug: "dev-project" });
    }

    const token = await signSession({ userId: DEV_USER_ID, exp: Date.now() + SESSION_TTL_MS }, secret);
    return reply.send({ token, userId: DEV_USER_ID });
  });
}
