import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@llmlens/db";
import { apiKeys, projects } from "@llmlens/db/schema";
import { hashApiKey } from "./api-key.js";

export interface ApiKeyContext {
  apiKeyId: string;
  projectId: string;
  orgId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    apiKeyContext?: ApiKeyContext;
  }
}

export async function verifyApiKey(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const rawKey = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!rawKey) {
    return reply.code(401).send({ error: "missing_api_key" });
  }

  const keyHash = hashApiKey(rawKey);

  const [row] = await db
    .select({
      id: apiKeys.id,
      projectId: apiKeys.projectId,
      orgId: projects.orgId,
    })
    .from(apiKeys)
    .innerJoin(projects, eq(projects.id, apiKeys.projectId))
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!row) {
    return reply.code(401).send({ error: "invalid_api_key" });
  }

  request.apiKeyContext = {
    apiKeyId: row.id,
    projectId: row.projectId,
    orgId: row.orgId,
  };

  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch((err) => request.log.warn({ err }, "failed to update api key last_used_at"));
}
