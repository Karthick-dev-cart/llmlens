"use client";

import { useActionState, useState } from "react";
import { createBudgetAction, type CreateBudgetState } from "@/app/actions";

const initialState: CreateBudgetState = {};

export function CreateBudgetForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createBudgetAction, initialState);
  const [channelType, setChannelType] = useState("none");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Period
          <select
            name="period"
            defaultValue="daily"
            className="rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Threshold (USD)
          <input
            type="number"
            name="thresholdUsd"
            min="0.01"
            step="0.01"
            required
            placeholder="100.00"
            className="w-32 rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Alert channel
          <select
            name="channelType"
            value={channelType}
            onChange={(e) => setChannelType(e.target.value)}
            className="rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="none">None</option>
            <option value="email">Email</option>
            <option value="slack">Slack webhook</option>
          </select>
        </label>
        {channelType === "email" && (
          <label className="flex flex-col gap-1 text-xs text-foreground/60">
            Email address
            <input
              type="email"
              name="channelEmail"
              required
              placeholder="ops@example.com"
              className="w-56 rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
        )}
        {channelType === "slack" && (
          <label className="flex flex-col gap-1 text-xs text-foreground/60">
            Webhook URL
            <input
              type="url"
              name="channelWebhookUrl"
              required
              placeholder="https://hooks.slack.com/..."
              className="w-72 rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create budget"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
