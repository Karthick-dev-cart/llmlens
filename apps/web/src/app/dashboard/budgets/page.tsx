import { apiFetch } from "@/lib/api";
import { requireSessionAndProject } from "@/lib/auth";
import type { AlertEvent, Budget } from "@/lib/types";
import { CreateBudgetForm } from "@/components/CreateBudgetForm";
import { BudgetsTable } from "@/components/BudgetsTable";
import { AlertsTable } from "@/components/AlertsTable";

export default async function BudgetsPage() {
  const { token, project } = await requireSessionAndProject();
  if (!project) return null;

  const [{ budgets }, { alerts }] = await Promise.all([
    apiFetch<{ budgets: Budget[] }>(`/v1/projects/${project.id}/budgets`, token),
    apiFetch<{ alerts: AlertEvent[] }>(`/v1/projects/${project.id}/alerts`, token),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Budgets</h1>
        <p className="text-sm text-foreground/60">
          Get alerted when daily or monthly spend crosses a threshold.
        </p>
      </div>

      <CreateBudgetForm projectId={project.id} />

      <div className="rounded-lg border border-foreground/10 p-4">
        <BudgetsTable projectId={project.id} budgets={budgets} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-foreground/70">Recent alerts</h2>
        <div className="rounded-lg border border-foreground/10 p-4">
          <AlertsTable alerts={alerts} />
        </div>
      </div>
    </div>
  );
}
