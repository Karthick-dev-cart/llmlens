"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/lib/format";
import type { MetricsTimeseriesPoint } from "@/lib/types";

function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CostTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MetricsTimeseriesPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-foreground/10 bg-background px-3 py-2 text-xs shadow-sm">
      <div className="font-medium">{formatDateShort(point.date)}</div>
      <div className="mt-1 text-foreground/70">{formatUsd(point.costUsd)}</div>
      <div className="text-foreground/50">
        {point.events} requests · {point.errors} errors
      </div>
    </div>
  );
}

export function MetricsChart({ series }: { series: MetricsTimeseriesPoint[] }) {
  if (series.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-foreground/50">
        No usage yet in this range.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-foreground/10" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatUsd(v)}
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip content={<CostTooltip />} />
          <Bar dataKey="costUsd" fill="currentColor" radius={[3, 3, 0, 0]} className="text-sky-600" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
