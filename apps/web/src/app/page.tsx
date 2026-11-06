import { loginAction } from "./actions";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">LLMLens</h1>
        <p className="text-sm text-foreground/70">
          Drop-in observability for your OpenAI and Anthropic API spend — cost, tokens, latency,
          and errors, broken down per model and per project.
        </p>
      </div>
      <form action={loginAction}>
        <button
          type="submit"
          className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
        >
          Enter dashboard (dev login)
        </button>
      </form>
      <p className="max-w-sm text-xs text-foreground/50">
        Dev-only stub auth — signs you in as a fixed demo user with no password. Will be replaced
        by real auth before launch.
      </p>
    </main>
  );
}
