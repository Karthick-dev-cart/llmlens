import { wrapOpenAI } from "./wrap-openai.js";
import { shutdownAllCaptures } from "./capture.js";

// Proves the actual claim — "the wrapper adds no latency to the call you're
// awaiting" — by measuring time-to-resolve for the caller, not time
// including the background capture/flush work. A fast, local fake stands in
// for the network call so what's being measured is the wrapper's own
// overhead, not variance from an LLM API round-trip.

const ITERATIONS = 50_000;

function makeFakeClient() {
  const response = {
    model: "gpt-4o",
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
  return {
    chat: { completions: { create: async () => response } },
  };
}

async function benchUnwrapped(): Promise<number> {
  const client = makeFakeClient();
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await client.chat.completions.create();
  }
  return performance.now() - start;
}

async function benchWrapped(): Promise<number> {
  const client = makeFakeClient();
  const wrapped = wrapOpenAI(client, {
    apiKey: "bench",
    endpoint: "http://localhost:3001",
    flushIntervalMs: 60_000, // never fires during the run; drained once at the end
    maxBufferSize: ITERATIONS + 1, // this run is measuring call latency, not buffer behavior
    fetchImpl: (async () => new Response(null, { status: 202 })) as unknown as typeof fetch,
  });
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await wrapped.chat.completions.create();
  }
  const elapsed = performance.now() - start;
  await shutdownAllCaptures();
  return elapsed;
}

async function main() {
  // one warm-up pass of each to let the JIT settle before the real measurement
  await benchUnwrapped();
  await benchWrapped();

  const unwrappedMs = await benchUnwrapped();
  const wrappedMs = await benchWrapped();

  const unwrappedPerCall = (unwrappedMs / ITERATIONS) * 1000; // microseconds
  const wrappedPerCall = (wrappedMs / ITERATIONS) * 1000;
  const overheadPerCall = wrappedPerCall - unwrappedPerCall;

  console.log(`${ITERATIONS} calls, unwrapped: ${unwrappedMs.toFixed(1)}ms total (${unwrappedPerCall.toFixed(2)}µs/call)`);
  console.log(`${ITERATIONS} calls, wrapped:   ${wrappedMs.toFixed(1)}ms total (${wrappedPerCall.toFixed(2)}µs/call)`);
  console.log(`wrapper overhead: ~${overheadPerCall.toFixed(2)}µs/call added to the awaited call itself`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
