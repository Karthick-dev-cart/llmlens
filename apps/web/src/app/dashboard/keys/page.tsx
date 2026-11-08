import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { requireSessionAndProject } from "@/lib/auth";
import type { ApiKeySummary } from "@/lib/types";
import { CreateKeyForm } from "@/components/CreateKeyForm";
import { revokeApiKeyAction } from "../../actions";
import { PageSkeleton } from "@/components/PageSkeleton";

export default function ApiKeysPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApiKeysContent />
    </Suspense>
  );
}

async function ApiKeysContent() {
  const { token, project } = await requireSessionAndProject();
  if (!project) return null;

  const { apiKeys } = await apiFetch<{ apiKeys: ApiKeySummary[] }>(
    `/v1/projects/${project.id}/api-keys`,
    token,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">API Keys</h1>
        <p className="text-sm text-foreground/60">
          Use a key as the Bearer token when sending usage events to the ingestion API.
        </p>
      </div>

      <CreateKeyForm projectId={project.id} />

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-foreground/10 text-left text-foreground/50">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Key</th>
            <th className="py-2 font-medium">Created</th>
            <th className="py-2 font-medium">Last used</th>
            <th className="py-2 font-medium">Status</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {apiKeys.map((key) => (
            <tr key={key.id} className="border-b border-foreground/5">
              <td className="py-2">{key.name}</td>
              <td className="py-2 font-mono text-xs text-foreground/60">{key.keyPrefix}…</td>
              <td className="py-2 text-foreground/60">
                {new Date(key.createdAt).toLocaleDateString()}
              </td>
              <td className="py-2 text-foreground/60">
                {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "never"}
              </td>
              <td className="py-2">
                {key.revokedAt ? (
                  <span className="text-foreground/40">revoked</span>
                ) : (
                  <span className="text-emerald-600">active</span>
                )}
              </td>
              <td className="py-2 text-right">
                {!key.revokedAt && (
                  <form action={revokeApiKeyAction}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="keyId" value={key.id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      Revoke
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {apiKeys.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-foreground/50">
                No API keys yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
