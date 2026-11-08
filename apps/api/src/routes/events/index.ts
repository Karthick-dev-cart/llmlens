import type { FastifyInstance } from "fastify";
import { verifySessionAuth } from "../../lib/auth/verify-session.js";
import { assertProjectAccess } from "../../lib/projects/access.js";
import { getEvents, type EventsQuery } from "../../lib/events/queries.js";

export async function eventsRoutes(app: FastifyInstance) {
  app.get("/v1/projects/:id/events", { preHandler: verifySessionAuth }, async (request, reply) => {
    const ctx = request.sessionContext!;
    const { id } = request.params as { id: string };
    const project = await assertProjectAccess(id, ctx.orgIds);
    if (!project) return reply.code(404).send({ error: "not_found" });

    return reply.send(await getEvents(id, request.query as EventsQuery));
  });
}
