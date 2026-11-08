import Link from "next/link";
import { loginAction } from "./actions";

const FEATURES = [
  {
    title: "Drop-in SDK",
    body: "Wrap your existing OpenAI/Anthropic client. Same return value, same types — usage capture rides along without adding latency to the call.",
  },
  {
    title: "Real-time cost tracking",
    body: "Server-computed cost from a versioned pricing table, visible in the dashboard within seconds of the request completing.",
  },
  {
    title: "Breakdowns that answer \"why\"",
    body: "Group spend by model, provider, status, or feature tag, and drill into the raw event log behind any number.",
  },
  {
    title: "Budget alerts",
    body: "Set a daily or monthly threshold per project and get an email or Slack alert the moment you cross it.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-16 px-8 py-16 text-center">
      <div className="max-w-xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">LLMLens</h1>
        <p className="text-base text-foreground/70">
          Drop-in observability for your OpenAI and Anthropic API spend — cost, tokens, latency,
          and errors, broken down per model and per project, in real time.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/demo"
            className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            View live demo
          </Link>
          <form action={loginAction}>
            <button
              type="submit"
              className="rounded-md border border-foreground/20 px-5 py-2.5 text-sm font-medium transition hover:border-foreground/40"
            >
              Enter dashboard (dev login)
            </button>
          </form>
        </div>
        <p className="pt-1 text-xs text-foreground/50">
          Dev login is a stub — signs you in as a fixed demo user with no password. The live demo
          needs no login at all.
        </p>
      </div>

      <div className="grid max-w-3xl gap-6 text-left sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-lg border border-foreground/10 p-4">
            <h2 className="text-sm font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-foreground/60">{f.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
