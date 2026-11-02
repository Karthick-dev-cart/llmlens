# LLMLens

**LLM API cost & usage observability** — a drop-in SDK plus dashboard that gives teams visibility into what their OpenAI/Anthropic spend is actually going to, in real time, without adding latency to the LLM calls themselves.

## Why this exists

Teams integrating multiple LLM providers lose track of spend fast: no per-feature cost attribution, no budget alerts, no visibility into whether a cheaper model would do the job just as well. LLMLens is a small, opinionated observability layer purpose-built for that problem — not a general APM tool with LLM support bolted on.

## Architecture

```
apps/
  api/            Fastify ingestion + query API, BullMQ worker, Drizzle/Timescale schema
  web/             Next.js dashboard, landing page, public no-login demo
packages/
  sdk/            @llmlens/sdk — Proxy-based OpenAI/Anthropic wrapper, async usage capture
  shared-types/   Zod schemas shared by api/web/sdk (the ingestion contract)
  seed-data/       Synthetic usage-event generator — load-test tool and public demo seed
infra/
  docker-compose.yml   Local Postgres+TimescaleDB and Redis
```

**Key design decisions:**
- **Cost is server-authoritative.** The SDK sends only raw token counts; the ingestion worker computes `cost_usd` from a versioned `model_pricing` table. One source of truth, auditable if provider pricing changes.
- **Non-blocking SDK.** The wrapper returns the caller's original promise untouched; usage capture rides along via `.then()`/`.catch()` on that same promise and is batched/flushed separately. Zero added latency to the real LLM call — this is the thing to benchmark and prove, not just assert.
- **TimescaleDB over ClickHouse.** Hypertables + continuous aggregates give real rollup performance while staying in transactional SQL — the right tradeoff for a solo-operated product, at the cost of ClickHouse-grade raw throughput we don't need yet.
- **Async ingestion via BullMQ/Redis.** Decouples the write path from request handling so ingestion spikes don't degrade API latency; gives a real backpressure/retry story.

## Local development

```bash
pnpm install
pnpm db:up            # starts Postgres+Timescale and Redis (requires Docker running)
pnpm --filter @llmlens/api db:migrate
pnpm dev               # runs all apps via turbo
```

API health check: `http://localhost:3001/health`. Web: `http://localhost:3000`.

## Roadmap (10-week build plan)

| Week | Milestone | Demo at end of week |
|---|---|---|
| 1 | Monorepo foundations, schema, CI | Empty dashboard + API health check, live |
| 2 | Ingestion pipeline core (API key auth, queue, cost calc) | Scripted events land in DB, queryable |
| 3 | Synthetic data generator | Pipeline survives realistic multi-month synthetic load |
| 4 | Timescale continuous aggregates | Sub-100ms rollup queries over millions of seeded rows |
| 5 | SDK v1 (OpenAI, non-streaming) | Sample app + real key → events visible in seconds |
| 6 | SDK v2 (Anthropic + streaming) + dashboard MVP | User creates project, key, sees own usage live |
| 7 | Breakdowns & filters | Group-by model/provider/tag, raw-event explorer |
| 8 | Budgets & alerts | Real email/Slack alert on threshold breach |
| 9 | Public demo + landing page | No-login public demo with always-fresh seeded data |
| 10 | Hardening & launch prep | Monitoring, architecture write-up, interview notes |

**Explicitly out of scope for the core build:** billing/payments, providers beyond OpenAI+Anthropic, real-time websocket updates, granular RBAC, multi-region infra. **Stretch, in priority order:** cost-only model-substitution advisor (explicitly not a quality evaluation), anomaly detection, live-tail, a third provider.

## Stack

Turborepo/pnpm · Fastify + TypeScript · Next.js (App Router) · TimescaleDB (Postgres) · Drizzle ORM · BullMQ/Redis · Clerk (auth) · Resend (email) · Fly.io (api/worker) + Vercel (web) + Timescale Cloud (db).
