import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@llmlens/db";
import { projects, apiKeys } from "@llmlens/db/schema";
import { verifySessionAuth } from "../../lib/auth/verify-session.js";
import { generateApiKey } from "../../lib/auth/api-key.js";
import { assertProjectAccess } from "../../lib/projects/access.js";

export async function projectRoutes(app: FastifyInstance) {
  app.get("/v1/projects", { preHandler: verifySessionAuth }, async (request, reply) => {
    const ctx = request.sessionContext!;
    if (ctx.orgIds.length === 0) return reply.send({ projects: [] });
    const rows = await db.select().from(projects).where(inArray(projects.orgId, ctx.orgIds));
    return reply.send({ projects: rows });
  });

  app.get("/v1/projects/:id/api-keys", { preHandler: verifySessionAuth }, async (request, reply) => {
    const ctx = request.sessionContext!;
    const { id } = request.params as { id: string };
    const project = await assertProjectAccess(id, ctx.orgIds);
    if (!project) return reply.code(404).send({ error: "not_found" });

    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.projectId, id));
    return reply.send({ apiKeys: rows });
  });

  app.post("/v1/projects/:id/api-keys", { preHandler: verifySessionAuth }, async (request, reply) => {
    const ctx = request.sessionContext!;
    const { id } = request.params as { id: string };
    const project = await assertProjectAccess(id, ctx.orgIds);
    if (!project) return reply.code(404).send({ error: "not_found" });

    const body = request.body as { name?: string } | undefined;
    const name = body?.name?.trim() || "unnamed key";
    const { rawKey, prefix, hash } = generateApiKey();
    await db.insert(apiKeys).values({ projectId: id, name, keyPrefix: prefix, keyHash: hash });
    // rawKey is shown exactly once — only keyHash is ever persisted.
    return reply.code(201).send({ rawKey, prefix, name });
  });

  app.delete(
    "/v1/projects/:id/api-keys/:keyId",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id, keyId } = request.params as { id: string; keyId: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.projectId, id)));
      return reply.code(204).send();
    },
  );
}
