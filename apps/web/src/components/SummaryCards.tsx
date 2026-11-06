import { formatCompactNumber, formatPercent, formatUsd } from "@/lib/format";
import type { MetricsSummary } from "@/lib/types";

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 p-4">
      <div className="text-xs font-medium text-foreground/60">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-foreground/50">{hint}</div>}
    </div>
  );
}

export function SummaryCards({ summary }: { summary: MetricsSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card label="Total cost" value={formatUsd(summary.totalCostUsd)} />
      <Card label="Total tokens" value={formatCompactNumber(summary.totalTokens)} />
      <Card label="Requests" value={formatCompactNumber(summary.totalEvents)} />
      <Card
        label="Error rate"
        value={formatPercent(summary.totalErrors, summary.totalEvents)}
        hint={`${summary.totalErrors} errors`}
      />
    </div>
  );
}
