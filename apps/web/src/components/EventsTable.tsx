import { formatMs, formatUsd } from "@/lib/format";
import type { RawEvent } from "@/lib/types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function EventsTable({ events }: { events: RawEvent[] }) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-foreground/50">No events in this range.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-foreground/10 text-left text-foreground/50">
          <th className="py-2 font-medium">Time</th>
          <th className="py-2 font-medium">Model</th>
          <th className="py-2 font-medium">Operation</th>
          <th className="py-2 font-medium">Tokens</th>
          <th className="py-2 font-medium">Cost</th>
          <th className="py-2 font-medium">Latency</th>
          <th className="py-2 font-medium">Status</th>
          <th className="py-2 font-medium">Feature</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id} className="border-b border-foreground/5">
            <td className="py-2 whitespace-nowrap text-foreground/70">
              {formatTimestamp(event.occurredAt)}
            </td>
            <td className="py-2">
              <div>{event.model}</div>
              <div className="text-xs text-foreground/50">{event.provider}</div>
            </td>
            <td className="py-2 text-foreground/70">{event.operation}</td>
            <td className="py-2 tabular-nums text-foreground/70">{event.totalTokens}</td>
            <td className="py-2 tabular-nums text-foreground/70">
              {event.costUsd != null ? formatUsd(event.costUsd) : "—"}
            </td>
            <td className="py-2 tabular-nums text-foreground/70">{formatMs(event.latencyMs)}</td>
            <td className="py-2">
              {event.status === "error" ? (
                <span className="text-red-600" title={event.errorType ?? undefined}>
                  error
                </span>
              ) : (
                <span className="text-emerald-600">success</span>
              )}
            </td>
            <td className="py-2 text-foreground/70">{event.tags.feature ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
