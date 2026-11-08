import Link from "next/link";
import { publicApiFetch } from "@/lib/api";
import type {
  BreakdownDimension,
  BreakdownResponse,
  MetricsSummary,
  MetricsTimeseries,
} from "@/lib/types";
import { SummaryCards } from "@/components/SummaryCards";
import { MetricsChart } from "@/components/MetricsChart";
import { BreakdownTable } from "@/components/BreakdownTable";

const DIMENSIONS: { value: BreakdownDimension; label: string }[] = [
  { value: "model", label: "Model" },
  { value: "provider", label: "Provider" },
  { value: "status", label: "Status" },
  { value: "feature", label: "Feature" },
];

function isDimension(value: string | undefined): value is BreakdownDimension {
  return DIMENSIONS.some((d) => d.value === value);
}

// Same reasoning as app/dashboard/layout.tsx: this route is always live
// data (the whole point of "always-fresh"), no static shell worth carving
// out.
export const instant = false;

export default async function PublicDemoPage({ searchParams }: PageProps<"/demo">) {
  const params = await searchParams;
  const requested = Array.isArray(params.dimension) ? params.dimension[0] : params.dimension;
  const dimension: BreakdownDimension = isDimension(requested) ? requested : "model";

  const [summary, timeseries, breakdown] = await Promise.all([
    publicApiFetch<MetricsSummary>("/v1/demo/metrics/summary"),
    publicApiFetch<MetricsTimeseries>("/v1/demo/metrics/timeseries"),
    publicApiFetch<BreakdownResponse>(`/v1/demo/metrics/breakdown?dimension=${dimension}`),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
        <Link href="/" className="text-sm font-semibold">
          LLMLens
        </Link>
        <Link
          href="/"
          className="rounded-md bg-foreground px-4 py-1.5 text-sm font-medium text-background"
        >
          Enter your own dashboard
        </Link>
      </header>

      <main className="flex-1 p-6">
        <div className="mb-6 rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm">
          Public demo — synthetic data, no login required. Refreshes automatically every few
          hours so the last 30 days always look current.
        </div>

        <div className="flex flex-col gap-6">
          <SummaryCards summary={summary} />

          <div className="rounded-lg border border-foreground/10 p-4">
            <h2 className="mb-2 text-sm font-medium text-foreground/70">Daily cost</h2>
            <MetricsChart series={timeseries.series} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-foreground/70">
              Breakdown by {dimension}
            </h2>
            <div className="mb-2 flex gap-1 border-b border-foreground/10">
              {DIMENSIONS.map((d) => (
                <Link
                  key={d.value}
                  href={`/demo?dimension=${d.value}`}
                  className={`border-b-2 px-3 py-2 text-sm ${
                    d.value === dimension
                      ? "border-foreground text-foreground"
                      : "border-transparent text-foreground/60 hover:text-foreground"
                  }`}
                >
                  {d.label}
                </Link>
              ))}
            </div>
            <div className="rounded-lg border border-foreground/10 p-4">
              <BreakdownTable breakdown={breakdown.breakdown} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
