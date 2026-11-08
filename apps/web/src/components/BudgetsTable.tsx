import { formatUsd } from "@/lib/format";
import type { Budget } from "@/lib/types";
import { deleteBudgetAction } from "@/app/actions";

function channelLabel(channelConfig: Budget["channelConfig"]): string {
  if ("type" in channelConfig && channelConfig.type === "email") return `email → ${channelConfig.to}`;
  if ("type" in channelConfig && channelConfig.type === "slack") return "Slack webhook";
  return "no channel configured";
}

export function BudgetsTable({ projectId, budgets }: { projectId: string; budgets: Budget[] }) {
  if (budgets.length === 0) {
    return <p className="py-6 text-center text-sm text-foreground/50">No budgets yet.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-foreground/10 text-left text-foreground/50">
          <th className="py-2 font-medium">Period</th>
          <th className="py-2 font-medium">Spend vs threshold</th>
          <th className="py-2 font-medium">Channel</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody>
        {budgets.map((budget) => {
          const pct = Math.min((budget.currentSpendUsd / budget.thresholdUsd) * 100, 100);
          const breached = budget.currentSpendUsd >= budget.thresholdUsd;
          return (
            <tr key={budget.id} className="border-b border-foreground/5">
              <td className="py-3 capitalize">{budget.period}</td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  <span className={`tabular-nums ${breached ? "text-red-500" : ""}`}>
                    {formatUsd(budget.currentSpendUsd)} / {formatUsd(budget.thresholdUsd)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={`h-full rounded-full ${breached ? "bg-red-500" : "bg-sky-600"}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </td>
              <td className="py-3 text-foreground/70">{channelLabel(budget.channelConfig)}</td>
              <td className="py-3 text-right">
                <form action={deleteBudgetAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="budgetId" value={budget.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
