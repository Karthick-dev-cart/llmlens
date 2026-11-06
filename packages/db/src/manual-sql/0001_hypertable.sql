-- Run once after the drizzle-generated usage_events table exists.
-- drizzle-kit has no concept of Timescale hypertables, so this step is
-- hand-written and applied separately (see db/migrate.ts).
--
-- p95 latency is deliberately not in these continuous aggregates: ordered-set
-- aggregates (percentile_cont/percentile_disc) aren't supported inside
-- timescaledb.continuous views. p95 is computed with a bounded raw-table
-- scan over usage_events at query time instead (see Week 7 metrics routes).
--
-- Both views set materialized_only = false (below): the Timescale default
-- (true) means queries only see data the refresh policy has already
-- materialized — roughly the last hour (daily) / 3 hours (hourly, per the
-- policy offsets below) would be invisible. For a dashboard pitched on
-- *real-time* spend visibility, a dashboard chart that can't show the usage
-- event you just sent through the SDK moments ago directly breaks the
-- Week 6 "sees own usage live" demo — and would look fine against the
-- historical seed data, which is fully materialized, so this would stay
-- hidden until a live SDK call was actually driven through to the chart.
-- false makes the view transparently union materialized history with a
-- live query of the unmaterialized tail — one query, no app-level UNION.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_events_pkey') THEN
    ALTER TABLE usage_events ADD PRIMARY KEY (id, occurred_at);
  END IF;
END $$;

SELECT create_hypertable('usage_events', by_range('occurred_at'), if_not_exists => TRUE);

CREATE MATERIALIZED VIEW IF NOT EXISTS usage_rollup_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', occurred_at) AS bucket,
  project_id,
  provider,
  model,
  status,
  sum(total_tokens) AS total_tokens,
  sum(cost_usd) AS total_cost_usd,
  count(*) AS event_count,
  avg(latency_ms) AS avg_latency_ms,
  max(latency_ms) AS max_latency_ms,
  count(*) FILTER (WHERE status = 'error') AS error_count
FROM usage_events
GROUP BY bucket, project_id, provider, model, status
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS usage_rollup_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', occurred_at) AS bucket,
  project_id,
  provider,
  model,
  status,
  sum(total_tokens) AS total_tokens,
  sum(cost_usd) AS total_cost_usd,
  count(*) AS event_count,
  avg(latency_ms) AS avg_latency_ms,
  max(latency_ms) AS max_latency_ms,
  count(*) FILTER (WHERE status = 'error') AS error_count
FROM usage_events
GROUP BY bucket, project_id, provider, model, status
WITH NO DATA;

SELECT add_continuous_aggregate_policy('usage_rollup_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('usage_rollup_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE);

ALTER MATERIALIZED VIEW usage_rollup_hourly SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW usage_rollup_daily SET (timescaledb.materialized_only = false);
