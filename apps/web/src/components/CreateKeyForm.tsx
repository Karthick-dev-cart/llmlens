"use client";

import { useActionState, useRef } from "react";
import { createApiKeyAction, type CreateApiKeyState } from "@/app/actions";

const initialState: CreateApiKeyState = {};

export function CreateKeyForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createApiKeyAction, initialState);
  const nameInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input
          ref={nameInputRef}
          type="text"
          name="name"
          placeholder="Key name (e.g. production)"
          required
          className="flex-1 rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state.rawKey && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Save this key now — it won&apos;t be shown again.</p>
          <code className="mt-2 block break-all rounded bg-background/60 px-2 py-1 font-mono text-xs">
            {state.rawKey}
          </code>
        </div>
      )}
    </div>
  );
}
