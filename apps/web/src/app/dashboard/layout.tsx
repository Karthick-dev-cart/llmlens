import Link from "next/link";
import { requireSessionAndProject } from "@/lib/auth";
import { logoutAction } from "../actions";

// The entire authenticated app is personalized/live data with no meaningful
// static shell to carve out — opt out of Cache Components' instant-navigation
// validation here rather than fighting it on every page underneath.
export const instant = false;

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { project } = await requireSessionAndProject();

  if (!project) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-sm text-foreground/70">
        No project found for this account yet.
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold">LLMLens</span>
          <nav className="flex gap-4 text-sm text-foreground/70">
            <Link href="/dashboard" className="hover:text-foreground">
              Overview
            </Link>
            <Link href="/dashboard/breakdown" className="hover:text-foreground">
              Breakdown
            </Link>
            <Link href="/dashboard/events" className="hover:text-foreground">
              Events
            </Link>
            <Link href="/dashboard/keys" className="hover:text-foreground">
              API Keys
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-foreground/70">
          <span>{project.name}</span>
          <form action={logoutAction}>
            <button type="submit" className="hover:text-foreground">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
