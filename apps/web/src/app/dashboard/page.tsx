import { apiFetch } from "@/lib/api";
import { requireSessionAndProject } from "@/lib/auth";
import type { MetricsSummary, MetricsTimeseries } from "@/lib/types";
import { SummaryCards } from "@/components/SummaryCards";
import { MetricsChart } from "@/components/MetricsChart";

export default async function DashboardOverviewPage() {
  const { token, project } = await requireSessionAndProject();
  if (!project) return null;

  const [summary, timeseries] = await Promise.all([
    apiFetch<MetricsSummary>(`/v1/projects/${project.id}/metrics/summary`, token),
    apiFetch<MetricsTimeseries>(`/v1/projects/${project.id}/metrics/timeseries`, token),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="text-sm text-foreground/60">Last 30 days, all models.</p>
      </div>
      <SummaryCards summary={summary} />
      <div className="rounded-lg border border-foreground/10 p-4">
        <h2 className="mb-2 text-sm font-medium text-foreground/70">Daily cost</h2>
        <MetricsChart series={timeseries.series} />
      </div>
    </div>
  );
}
