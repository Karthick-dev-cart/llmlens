import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { requireSessionAndProject } from "@/lib/auth";
import type { EventsPage } from "@/lib/types";
import { EventsTable } from "@/components/EventsTable";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EventsExplorerPage({
  searchParams,
}: PageProps<"/dashboard/events">) {
  const { token, project } = await requireSessionAndProject();
  if (!project) return null;

  const params = await searchParams;
  const provider = firstValue(params.provider);
  const status = firstValue(params.status);
  const cursor = firstValue(params.cursor);

  const query = new URLSearchParams();
  if (provider) query.set("provider", provider);
  if (status) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  query.set("limit", "50");

  const data = await apiFetch<EventsPage>(
    `/v1/projects/${project.id}/events?${query.toString()}`,
    token,
  );

  const nextQuery = new URLSearchParams();
  if (provider) nextQuery.set("provider", provider);
  if (status) nextQuery.set("status", status);
  if (data.nextCursor) nextQuery.set("cursor", data.nextCursor);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Events</h1>
        <p className="text-sm text-foreground/60">
          Raw usage events, newest first, last 30 days.
        </p>
      </div>

      <form method="get" className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Provider
          <select
            name="provider"
            defaultValue={provider ?? ""}
            className="rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-foreground px-4 py-1.5 text-sm font-medium text-background"
        >
          Filter
        </button>
        {(provider || status) && (
          <Link href="/dashboard/events" className="text-sm text-foreground/60 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <div className="rounded-lg border border-foreground/10 p-4">
        <EventsTable events={data.events} />
      </div>

      {data.nextCursor && (
        <Link
          href={`/dashboard/events?${nextQuery.toString()}`}
          className="self-start text-sm text-foreground/70 hover:underline"
        >
          Next page →
        </Link>
      )}
    </div>
  );
}
