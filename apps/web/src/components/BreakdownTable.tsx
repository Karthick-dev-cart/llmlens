import { formatCompactNumber, formatPercent, formatUsd } from "@/lib/format";
import type { BreakdownEntry } from "@/lib/types";

export function BreakdownTable({ breakdown }: { breakdown: BreakdownEntry[] }) {
  if (breakdown.length === 0) {
    return <p className="py-6 text-center text-sm text-foreground/50">No usage in this range.</p>;
  }

  const maxCost = Math.max(...breakdown.map((b) => b.costUsd), 0.000001);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-foreground/10 text-left text-foreground/50">
          <th className="py-2 font-medium">Key</th>
          <th className="py-2 font-medium">Cost</th>
          <th className="py-2 font-medium">Tokens</th>
          <th className="py-2 font-medium">Requests</th>
          <th className="py-2 font-medium">Error rate</th>
        </tr>
      </thead>
      <tbody>
        {breakdown.map((entry) => (
          <tr key={entry.key} className="border-b border-foreground/5">
            <td className="py-2.5">{entry.key}</td>
            <td className="py-2.5">
              <div className="flex items-center gap-2">
                <span className="w-20 tabular-nums">{formatUsd(entry.costUsd)}</span>
                <span
                  className="h-1.5 rounded-full bg-sky-600"
                  style={{ width: `${Math.max((entry.costUsd / maxCost) * 100, 2)}px` }}
                />
              </div>
            </td>
            <td className="py-2.5 tabular-nums text-foreground/70">
              {formatCompactNumber(entry.tokens)}
            </td>
            <td className="py-2.5 tabular-nums text-foreground/70">
              {formatCompactNumber(entry.events)}
            </td>
            <td className="py-2.5 tabular-nums text-foreground/70">
              {formatPercent(entry.errors, entry.events)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
