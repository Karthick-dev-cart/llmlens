import type { AlertEvent } from "@/lib/types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AlertsTable({ alerts }: { alerts: AlertEvent[] }) {
  if (alerts.length === 0) {
    return <p className="py-6 text-center text-sm text-foreground/50">No alerts triggered yet.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-foreground/10 text-left text-foreground/50">
          <th className="py-2 font-medium">Triggered</th>
          <th className="py-2 font-medium">Period</th>
          <th className="py-2 font-medium">Spend at trigger</th>
          <th className="py-2 font-medium">Threshold</th>
        </tr>
      </thead>
      <tbody>
        {alerts.map((alert) => (
          <tr key={alert.id} className="border-b border-foreground/5">
            <td className="py-2 whitespace-nowrap text-foreground/70">
              {formatTimestamp(alert.triggeredAt)}
            </td>
            <td className="py-2 capitalize text-foreground/70">{alert.period}</td>
            <td className="py-2 tabular-nums text-red-500">${alert.valueAtTrigger}</td>
            <td className="py-2 tabular-nums text-foreground/70">${alert.thresholdUsd}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
