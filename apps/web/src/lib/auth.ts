import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "./api";
import { getSessionToken } from "./session";
import type { Project } from "./types";

// Cheap, cookie-only gate — no network call. Callers that wrap their data
// fetch in <Suspense> (every dashboard page/layout does, to avoid blocking
// on apiFetch — see components/PageSkeleton.tsx) must call this *before*
// rendering the Suspense boundary, not inside it: once a Suspense fallback
// has started streaming, Next can no longer issue a real top-level HTTP
// redirect from a later redirect() call — it falls back to a client-side
// redirect plus a 1s <meta refresh>, so an unauthenticated request would
// get a 200 with the dashboard's loading skeleton instead of a clean 307.
// Confirmed via curl with no session cookie: without this gate, /dashboard
// returned 200 + skeleton + delayed client redirect; with it, a real 307.
//
// Cost of this fix: reading cookies() outside Suspense is itself a dynamic
// API access, so it pulls /dashboard* back to fully dynamic (ƒ) in `next
// build` instead of the Partial Prerender (◐) that came free when nothing
// gated the route before Suspense. That's the right trade — a route that
// can redirect based on a cookie can't have a static shell by definition,
// and a correct 307 matters more than a prerendered nav bar.
export async function requireSessionToken(): Promise<string> {
  const token = await getSessionToken();
  if (!token) redirect("/");
  return token;
}

// Every dashboard page needs the session token plus the user's primary
// project (MVP has exactly one project per account — no project switcher
// yet). Centralized so the redirect-on-missing/expired-session behavior
// can't drift between the layout and individual pages.
//
// Only the "no cookie at all" case (the common one — never logged in, or
// logged out) gets a guaranteed real redirect; call requireSessionToken()
// before Suspense for that. A cookie that's present but invalid/expired
// still only surfaces its redirect from inside Suspense here, so that
// narrower case gets the client-side-redirect fallback described above —
// an accepted tradeoff, not an oversight.
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
