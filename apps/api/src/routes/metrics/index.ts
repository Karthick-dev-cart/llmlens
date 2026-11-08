import type { FastifyInstance } from "fastify";
import { verifySessionAuth } from "../../lib/auth/verify-session.js";
import { assertProjectAccess } from "../../lib/projects/access.js";
import {
  parseRange,
  parseBreakdownDimension,
  getSummary,
  getTimeseries,
  getBreakdown,
  getLatency,
} from "../../lib/metrics/queries.js";

export async function metricsRoutes(app: FastifyInstance) {
  app.get(
    "/v1/projects/:id/metrics/summary",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id } = request.params as { id: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const { from, to } = parseRange(request.query);
      return reply.send(await getSummary(id, from, to));
    },
  );

  app.get(
    "/v1/projects/:id/metrics/timeseries",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id } = request.params as { id: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const { from, to } = parseRange(request.query);
      return reply.send(await getTimeseries(id, from, to));
    },
  );

  app.get(
    "/v1/projects/:id/metrics/breakdown",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id } = request.params as { id: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const dimension = parseBreakdownDimension(request.query);
      const { from, to } = parseRange(request.query);
      return reply.send(await getBreakdown(id, dimension, from, to));
    },
  );

  app.get(
    "/v1/projects/:id/metrics/latency",
    { preHandler: verifySessionAuth },
    async (request, reply) => {
      const ctx = request.sessionContext!;
      const { id } = request.params as { id: string };
      const project = await assertProjectAccess(id, ctx.orgIds);
      if (!project) return reply.code(404).send({ error: "not_found" });

      const { from, to } = parseRange(request.query);
      return reply.send(await getLatency(id, from, to));
    },
  );
}
