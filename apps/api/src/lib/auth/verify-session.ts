import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "@llmlens/db";
import { orgMembers } from "@llmlens/db/schema";
import { verifySession } from "../session/token.js";

export interface SessionContext {
  userId: string;
  orgIds: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    sessionContext?: SessionContext;
  }
}

export async function verifySessionAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return reply.code(401).send({ error: "missing_session" });

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    request.log.error("AUTH_SECRET is not set");
    return reply.code(500).send({ error: "server_misconfigured" });
  }

  const payload = await verifySession(token, secret);
  if (!payload) return reply.code(401).send({ error: "invalid_session" });

  const memberships = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, payload.userId));

  request.sessionContext = { userId: payload.userId, orgIds: memberships.map((m) => m.orgId) };
}
