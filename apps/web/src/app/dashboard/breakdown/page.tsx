import { Suspense } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { requireSessionAndProject } from "@/lib/auth";
import type { BreakdownDimension, BreakdownResponse } from "@/lib/types";
import { BreakdownTable } from "@/components/BreakdownTable";
import { PageSkeleton } from "@/components/PageSkeleton";

const DIMENSIONS: { value: BreakdownDimension; label: string }[] = [
  { value: "model", label: "Model" },
  { value: "provider", label: "Provider" },
  { value: "status", label: "Status" },
  { value: "feature", label: "Feature" },
];

function isDimension(value: string | undefined): value is BreakdownDimension {
  return DIMENSIONS.some((d) => d.value === value);
}

export default function BreakdownPage({ searchParams }: PageProps<"/dashboard/breakdown">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BreakdownContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BreakdownContent({
  searchParams,
}: Pick<PageProps<"/dashboard/breakdown">, "searchParams">) {
  const { token, project } = await requireSessionAndProject();
  if (!project) return null;

  const params = await searchParams;
  const requested = Array.isArray(params.dimension) ? params.dimension[0] : params.dimension;
  const dimension: BreakdownDimension = isDimension(requested) ? requested : "model";

  const data = await apiFetch<BreakdownResponse>(
    `/v1/projects/${project.id}/metrics/breakdown?dimension=${dimension}`,
    token,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Breakdown</h1>
        <p className="text-sm text-foreground/60">Last 30 days, grouped by {dimension}.</p>
      </div>

      <div className="flex gap-1 border-b border-foreground/10">
        {DIMENSIONS.map((d) => (
          <Link
            key={d.value}
            href={`/dashboard/breakdown?dimension=${d.value}`}
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
        <BreakdownTable breakdown={data.breakdown} />
      </div>
    </div>
  );
}
