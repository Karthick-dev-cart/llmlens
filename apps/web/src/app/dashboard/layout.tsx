import { Suspense } from "react";
import Link from "next/link";
import { requireSessionAndProject } from "@/lib/auth";
import { logoutAction } from "../actions";

// The entire authenticated app is personalized/live data with no meaningful
// static shell to carve out — opt out of Cache Components' instant-navigation
// validation here rather than fighting it on every page underneath.
export const instant = false;

// The data fetch (requireSessionAndProject) still needs its own Suspense
// boundary even with instant=false — that export silences the build-time
// instant-navigation validator, but the dev-overlay's separate "uncached
// data during navigation" runtime warning only goes away when the fetch is
// actually wrapped in Suspense (confirmed: instant=false alone did not
// suppress it).
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}

async function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
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
            <Link href="/dashboard/budgets" className="hover:text-foreground">
              Budgets
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
