import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { requireSessionAndProject } from "@/lib/auth";
import { formatMs } from "@/lib/format";
import type { LatencyMetrics, MetricsSummary, MetricsTimeseries } from "@/lib/types";
import { SummaryCards } from "@/components/SummaryCards";
import { MetricsChart } from "@/components/MetricsChart";
import { PageSkeleton } from "@/components/PageSkeleton";

export default function DashboardOverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardOverviewContent />
    </Suspense>
  );
}

async function DashboardOverviewContent() {
  const { token, project } = await requireSessionAndProject();
  if (!project) return null;

  const [summary, timeseries, latency] = await Promise.all([
    apiFetch<MetricsSummary>(`/v1/projects/${project.id}/metrics/summary`, token),
    apiFetch<MetricsTimeseries>(`/v1/projects/${project.id}/metrics/timeseries`, token),
    apiFetch<LatencyMetrics>(`/v1/projects/${project.id}/metrics/latency`, token),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="text-sm text-foreground/60">Last 30 days, all models.</p>
      </div>
      <SummaryCards summary={summary} />
      <div className="rounded-lg border border-foreground/10 p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-foreground/70">Daily cost</h2>
          {latency.sampleCount > 0 && (
            <span className="text-xs text-foreground/50">
              latency p50 {formatMs(latency.p50LatencyMs)} · p95 {formatMs(latency.p95LatencyMs)}
            </span>
          )}
        </div>
        <MetricsChart series={timeseries.series} />
      </div>
    </div>
  );
}
