import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { DEMO_PROJECT_ID } from "@llmlens/shared-types";
import {
  parseRange,
  parseBreakdownDimension,
  getSummary,
  getTimeseries,
  getBreakdown,
  getLatency,
} from "../../lib/metrics/queries.js";
import { getEvents, type EventsQuery } from "../../lib/events/queries.js";

// Public, unauthenticated routes for the no-login demo (Week 9). Security
// invariant: DEMO_PROJECT_ID is a hardcoded constant passed to the shared
// query functions below — never read from a param, query string, body, or
// (for /events) the pagination cursor. There is no code path in this file
// that lets a request pick which project it queries, so the entire public
// surface is scoped to exactly the demo project by construction.
//
// Registering @fastify/rate-limit inside this plugin function (rather than
// at the app root) scopes it to just these routes via Fastify's plugin
// encapsulation — the authenticated routes are unaffected.
export async function demoRoutes(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
  });

  app.get("/v1/demo/metrics/summary", async (request, reply) => {
    const { from, to } = parseRange(request.query);
    return reply.send(await getSummary(DEMO_PROJECT_ID, from, to));
  });

  app.get("/v1/demo/metrics/timeseries", async (request, reply) => {
    const { from, to } = parseRange(request.query);
    return reply.send(await getTimeseries(DEMO_PROJECT_ID, from, to));
  });

  app.get("/v1/demo/metrics/breakdown", async (request, reply) => {
    const dimension = parseBreakdownDimension(request.query);
    const { from, to } = parseRange(request.query);
    return reply.send(await getBreakdown(DEMO_PROJECT_ID, dimension, from, to));
  });

  app.get("/v1/demo/metrics/latency", async (request, reply) => {
    const { from, to } = parseRange(request.query);
    return reply.send(await getLatency(DEMO_PROJECT_ID, from, to));
  });

  app.get("/v1/demo/events", async (request, reply) => {
    return reply.send(await getEvents(DEMO_PROJECT_ID, request.query as EventsQuery));
  });
}
