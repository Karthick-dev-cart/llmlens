# LLMLens

**LLM API cost & usage observability** — a drop-in SDK plus dashboard that gives teams visibility into what their OpenAI/Anthropic spend is actually going to, in real time, without adding latency to the LLM calls themselves.

## Why this exists

Teams integrating multiple LLM providers lose track of spend fast: no per-feature cost attribution, no budget alerts, no visibility into whether a cheaper model would do the job just as well. LLMLens is a small, opinionated observability layer purpose-built for that problem — not a general APM tool with LLM support bolted on.

## Architecture

```
apps/
  api/            Fastify ingestion + query API, BullMQ worker
  web/             Next.js dashboard, landing page, public no-login demo
packages/
  db/             @llmlens/db — Drizzle/Timescale schema, migrations, client (shared by api + seed-data)
  sdk/            @llmlens/sdk — Proxy-based OpenAI/Anthropic wrapper, async usage capture
  shared-types/   Zod schemas shared by api/web/sdk (the ingestion contract)
  seed-data/       Synthetic usage-event generator — load-test tool and public demo seed
infra/
  docker-compose.yml   Local Postgres+TimescaleDB and Redis
```

**Key design decisions:**
- **Cost is server-authoritative.** The SDK sends only raw token counts; the ingestion worker computes `cost_usd` from a versioned `model_pricing` table. One source of truth, auditable if provider pricing changes.
- **Non-blocking SDK.** The wrapper returns the caller's original promise untouched; usage capture rides along via `.then()`/`.catch()` on that same promise and is batched/flushed separately. Benchmarked, not just asserted: ~2.9µs added per call against a local fake (`pnpm --filter @llmlens/sdk bench`) — noise next to any real LLM round-trip.
- **TimescaleDB over ClickHouse.** Hypertables + continuous aggregates give real rollup performance while staying in transactional SQL — the right tradeoff for a solo-operated product, at the cost of ClickHouse-grade raw throughput we don't need yet.
- **Async ingestion via BullMQ/Redis.** Decouples the write path from request handling so ingestion spikes don't degrade API latency; gives a real backpressure/retry story.

## Local development

```bash
pnpm install
pnpm db:up            # starts Postgres+Timescale and Redis (requires Docker running)
pnpm db:migrate         # requires DATABASE_URL in the environment (see packages/db/.env.example)
pnpm dev               # runs all apps via turbo
```

API health check: `http://localhost:3001/health`. Web: `http://localhost:3000`.

Local Postgres is exposed on **5433** (not 5432) to avoid clashing with a native Postgres install.

### SDK (`@llmlens/sdk`)

```ts
import OpenAI from "openai";
import { wrapOpenAI } from "@llmlens/sdk";

const openai = wrapOpenAI(new OpenAI(), {
  apiKey: process.env.LLMLENS_API_KEY!,
  endpoint: "https://ingest.llmlens.dev", // or http://localhost:3001 locally
  tags: { feature: "support-bot" },
});

// use `openai` exactly like the real client — same return value, same types
const completion = await openai.chat.completions.create({ model: "gpt-4o", messages: [...] });
```

`wrapOpenAI` traps `chat.completions.create` via a `Proxy` (three levels deep —
client → `chat` → `completions` — so every other method/property passes
through completely untouched) and returns the SDK's own promise unmodified.
Capture rides along via `.then()`/`.catch()` registered on that same
promise, batches in memory, and flushes to `/v1/events/batch` on a timer —
none of it is awaited before the wrapped call returns. Verified structurally
against the real `openai` package's class instance (not just a duck-typed
test double — private fields/getters behave differently under `Proxy`) and
end-to-end through the live ingestion pipeline into the hypertable.

```bash
pnpm --filter @llmlens/sdk bench
```

50k calls against a fast local fake (isolating the wrapper's own overhead
from LLM-API network variance): **~2.9µs added per call** — call `shutdownAllCaptures()`
before process exit to flush anything still buffered.

**Anthropic:**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { wrapAnthropic } from "@llmlens/sdk";

const anthropic = wrapAnthropic(new Anthropic(), { apiKey: process.env.LLMLENS_API_KEY!, endpoint: "..." });
const message = await anthropic.messages.create({ model: "claude-3-5-sonnet-20241022", max_tokens: 1024, messages: [...] });
```

**Streaming (OpenAI only so far):** forces `stream_options.include_usage: true`
(preserving any other options) and taps the terminal chunk for usage. The
returned value is a `Proxy` over the real `Stream` — every chunk passes
through unmodified and in order, and SDK-specific extras like `.controller`
survive — only iteration itself is intercepted, which is also why this one
case returns a *new* promise rather than the original: something has to
transform what it resolves to. If a caller explicitly sets
`include_usage: false`, the call is passed through completely unwrapped
instead of recording misleading zeroed usage. Anthropic streaming
(`message_start`/`content_block_delta`/`message_delta` events, usage split
across two of them) is a materially different shape and isn't supported yet.

### Rollup correctness & performance (`@llmlens/db`)

```bash
pnpm --filter @llmlens/db bench [projectId]
```

Compares `usage_rollup_daily` against a raw `usage_events` scan for the same
project, bucket-by-bucket (not just grand totals), and times both. Against
the ~1.03M-row seeded dataset: **~25ms via the rollup vs ~500ms for the
equivalent raw scan (~20x)**, with all 108 daily buckets matching exactly.
`EXPLAIN (ANALYZE, BUFFERS)` on the rollup query confirms it touches only the
materialized aggregate's chunks — never `usage_events` itself.

### Synthetic data (`@llmlens/seed-data`)

```bash
# write events to a JSONL file for inspection
pnpm --filter @llmlens/seed-data seed generate --from 2026-01-01 --to 2026-02-01 --out events.jsonl

# stress-test the real ingestion pipeline over HTTP (API must be running)
pnpm --filter @llmlens/seed-data seed load --from 2026-01-01 --to 2026-01-15 \
  --api http://localhost:3001 --key <api-key> --peak-per-hour 150

# bulk-insert directly into usage_events — the practical path to millions of
# rows (bypasses HTTP/queue; computes cost client-side the same way the
# worker does, from the same DEMO_MODEL_PRICING table)
pnpm --filter @llmlens/seed-data seed backfill --from 2025-11-01 --to 2026-02-01 \
  --project <uuid> --org <uuid> --peak-per-hour 2000
```

The generator simulates request seasonality (business hours, weekends), an
adoption growth ramp, a model mix that shifts from flagship to cost-optimized
models over the range, scattered incident windows with elevated errors and
latency, and a small fraction of traffic on a model that's deliberately not
in `model_pricing` — exercising the `cost_usd = NULL` path with realistic
data instead of only ever being tested by hand.

### Dashboard (`apps/web`)

Next.js (App Router, Cache Components enabled) server-rendering against the
API — no client-side data fetching for the dashboard itself. Auth is a
dev-only stub today: a Server Action calls `POST /v1/auth/dev-login`, stores
the returned token in an httpOnly cookie, and every dashboard route reads
that cookie and forwards it as a Bearer token. That's deliberately the same
shape a real Clerk integration will use, so swapping auth later shouldn't
touch the data-fetching code. `/dashboard` shows summary cards and a daily
cost chart wired to the rollup-backed `/metrics/summary` and
`/metrics/timeseries` endpoints; `/dashboard/keys` is full API key
create/revoke, with the one-time raw key (never shown again) surfaced via
`useActionState` rather than a page reload.

With `cacheComponents: true`, Next 16 inverts the usual caching default —
routes are static unless something forces them dynamic, rather than dynamic
unless cached. Request-time APIs (`cookies()`, uncached `fetch`) correctly
exclude a route from prerendering without failing the build; only
synchronous IO (`Date.now()`, `crypto.randomUUID()`) during prerender is a
hard error. Since literally every dashboard route is personalized/live data,
`instant = false` on `app/dashboard/layout.tsx` opts the whole subtree out of
the instant-navigation validator instead of fighting it — confirmed with
`next build` (`/` prerenders static, `/dashboard*` is dynamic) and by hand in
a browser against the live stack.

`/dashboard/breakdown` groups cost/tokens/errors by model, provider,
status, or feature tag over the same 30-day window, and `/dashboard/events`
is a raw per-event log with provider/status filters and keyset-cursor
pagination — both server-rendered, both work via plain `<form method="get">`
and `<Link>` search params rather than client-side state, so filters and
pagination are shareable URLs and don't need JS. Model/provider/status
breakdowns read straight from `usage_rollup_daily` (already grouped by those
columns); the feature-tag breakdown and the p50/p95 latency stat next to the
Overview chart are bounded raw-table scans instead, since tags aren't rolled
up and `percentile_cont` isn't supported inside a `timescaledb.continuous`
view.

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

Turborepo/pnpm · Fastify + TypeScript · Next.js (App Router, Cache Components) · TimescaleDB (Postgres) · Drizzle ORM · BullMQ/Redis · dev-stub auth today, Clerk planned · Resend (email) · Fly.io (api/worker) + Vercel (web) + Timescale Cloud (db).
