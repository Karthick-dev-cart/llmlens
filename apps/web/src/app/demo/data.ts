import { cacheLife } from "next/cache";
import { publicApiFetch } from "@/lib/api";
import type {
  BreakdownDimension,
  BreakdownResponse,
  MetricsSummary,
  MetricsTimeseries,
} from "@/lib/types";

export interface DemoData {
  summary: MetricsSummary;
  timeseries: MetricsTimeseries;
  breakdown: BreakdownResponse;
}

// The demo payload is identical for every visitor and only actually changes
// when the demo-refresh job tops up (every 3h, see apps/api/src/lib/demo/refresh.ts)
// — so it's cached and shared across all viewers rather than re-fetched from
// the API on every page view. That also fixes a rate-limit footgun: /v1/demo/*
// is rate-limited per source IP, but this page is server-rendered, so every
// visitor's request was hitting the API from the *web server's* IP. Without
// caching, demo traffic volume could trip that shared bucket. revalidate is
// well under the 3h top-up interval so the "always looks current" copy on
// the page stays true; expire is a hard ceiling in case revalidation itself
// never gets triggered (e.g. zero traffic for a while).
export async function getDemoData(dimension: BreakdownDimension): Promise<DemoData> {
  "use cache";
  cacheLife({ revalidate: 300, expire: 3600 });

  const [summary, timeseries, breakdown] = await Promise.all([
    publicApiFetch<MetricsSummary>("/v1/demo/metrics/summary"),
    publicApiFetch<MetricsTimeseries>("/v1/demo/metrics/timeseries"),
    publicApiFetch<BreakdownResponse>(`/v1/demo/metrics/breakdown?dimension=${dimension}`),
  ]);

  return { summary, timeseries, breakdown };
}
