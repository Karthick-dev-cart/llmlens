import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "./api";
import { getSessionToken } from "./session";
import type { Project } from "./types";

// Every dashboard page needs the session token plus the user's primary
// project (MVP has exactly one project per account — no project switcher
// yet). Centralized so the redirect-on-missing/expired-session behavior
// can't drift between the layout and individual pages.
export async function requireSessionAndProject(): Promise<{
  token: string;
  project: Project | undefined;
}> {
  const token = await getSessionToken();
  if (!token) redirect("/");

  try {
    const { projects } = await apiFetch<{ projects: Project[] }>("/v1/projects", token);
    return { token, project: projects[0] };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/");
    throw err;
  }
}
