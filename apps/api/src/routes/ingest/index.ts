import type { FastifyInstance } from "fastify";
import { usageEventInput, usageEventBatchInput } from "@llmlens/shared-types";
import { verifyApiKey } from "../../lib/auth/verify-api-key.js";
import { usageEventsQueue } from "../../queue/index.js";

export async function ingestRoutes(app: FastifyInstance) {
  app.post("/v1/events", { preHandler: verifyApiKey }, async (request, reply) => {
    const parsed = usageEventInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_event", details: parsed.error.flatten() });
    }

    const ctx = request.apiKeyContext!;
    await usageEventsQueue.add("ingest", {
      projectId: ctx.projectId,
      orgId: ctx.orgId,
      events: [parsed.data],
    });

    return reply.code(202).send({ accepted: 1 });
  });

  app.post("/v1/events/batch", { preHandler: verifyApiKey }, async (request, reply) => {
    const parsed = usageEventBatchInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_batch", details: parsed.error.flatten() });
    }

    const ctx = request.apiKeyContext!;
    await usageEventsQueue.add("ingest", {
      projectId: ctx.projectId,
      orgId: ctx.orgId,
      events: parsed.data.events,
    });

    return reply.code(202).send({ accepted: parsed.data.events.length });
  });
}
