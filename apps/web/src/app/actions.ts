"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch, ApiError, devLogin } from "@/lib/api";
import { getSessionToken, SESSION_COOKIE } from "@/lib/session";
import type { CreatedApiKey } from "@/lib/types";

export async function loginAction() {
  const { token } = await devLogin();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/dashboard");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/");
}

export interface CreateApiKeyState {
  rawKey?: string;
  name?: string;
  error?: string;
}

export async function createApiKeyAction(
  _prevState: CreateApiKeyState,
  formData: FormData,
): Promise<CreateApiKeyState> {
  const token = await getSessionToken();
  if (!token) redirect("/");

  const projectId = formData.get("projectId");
  const name = formData.get("name");
  if (typeof projectId !== "string" || typeof name !== "string" || !name.trim()) {
    return { error: "Name is required." };
  }

  try {
    const created = await apiFetch<CreatedApiKey>(`/v1/projects/${projectId}/api-keys`, token, {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
    revalidatePath("/dashboard/keys");
    return { rawKey: created.rawKey, name: created.name };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { error: "Project not found." };
    return { error: "Failed to create key." };
  }
}

export async function revokeApiKeyAction(formData: FormData) {
  const token = await getSessionToken();
  if (!token) redirect("/");

  const projectId = formData.get("projectId");
  const keyId = formData.get("keyId");
  if (typeof projectId !== "string" || typeof keyId !== "string") return;

  await apiFetch(`/v1/projects/${projectId}/api-keys/${keyId}`, token, { method: "DELETE" });
  revalidatePath("/dashboard/keys");
}

export interface CreateBudgetState {
  error?: string;
}

export async function createBudgetAction(
  _prevState: CreateBudgetState,
  formData: FormData,
): Promise<CreateBudgetState> {
  const token = await getSessionToken();
  if (!token) redirect("/");

  const projectId = formData.get("projectId");
  if (typeof projectId !== "string") redirect("/");

  const period = formData.get("period");
  if (period !== "daily" && period !== "monthly") {
    return { error: "Choose a period." };
  }

  const thresholdUsd = Number(formData.get("thresholdUsd"));
  if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
    return { error: "Enter a threshold greater than 0." };
  }

  const channelType = formData.get("channelType");
  let channelConfig: Record<string, unknown> = {};
  if (channelType === "email") {
    const to = formData.get("channelEmail");
    if (typeof to !== "string" || !to.trim()) return { error: "Enter an email address." };
    channelConfig = { type: "email", to: to.trim() };
  } else if (channelType === "slack") {
    const webhookUrl = formData.get("channelWebhookUrl");
    if (typeof webhookUrl !== "string" || !webhookUrl.trim()) {
      return { error: "Enter a Slack webhook URL." };
    }
    channelConfig = { type: "slack", webhookUrl: webhookUrl.trim() };
  }

  try {
    await apiFetch(`/v1/projects/${projectId}/budgets`, token, {
      method: "POST",
      body: JSON.stringify({ period, thresholdUsd, channelConfig }),
    });
  } catch {
    return { error: "Failed to create budget." };
  }

  revalidatePath("/dashboard/budgets");
  return {};
}

export async function deleteBudgetAction(formData: FormData) {
  const token = await getSessionToken();
  if (!token) redirect("/");

  const projectId = formData.get("projectId");
  const budgetId = formData.get("budgetId");
  if (typeof projectId !== "string" || typeof budgetId !== "string") return;

  await apiFetch(`/v1/projects/${projectId}/budgets/${budgetId}`, token, { method: "DELETE" });
  revalidatePath("/dashboard/budgets");
}
