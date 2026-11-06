import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { shutdownAllCaptures } from "./capture.js";
import { wrapOpenAI } from "./wrap-openai.js";

// wrap-openai.test.ts proves streaming capture against a fake async-iterable
// `create()` returns a native Promise there too. The real SDK's streaming
// path is materially different: create() resolves to a `Stream` instance
// that parses Server-Sent-Events off the raw HTTP response body as it's
// iterated. This proves the tap survives that real parsing pipeline — no
// API key, no network, a canned SSE body instead.

function sseResponse(events: unknown[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(async () => {
  await shutdownAllCaptures();
  vi.restoreAllMocks();
});

describe("wrapOpenAI streaming against the real openai SDK's Stream", () => {
  it("passes every real-parsed SSE chunk through unmodified and captures terminal usage", async () => {
    const chunks = [
      { id: "1", model: "gpt-4o", choices: [{ index: 0, delta: { content: "Hel" } }], usage: null },
      { id: "2", model: "gpt-4o", choices: [{ index: 0, delta: { content: "lo" } }], usage: null },
      {
        id: "3",
        model: "gpt-4o",
        choices: [],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      },
    ];
    const fakeFetch = vi.fn(async () => sseResponse(chunks));
    const realClient = new OpenAI({ apiKey: "sk-test", fetch: fakeFetch as unknown as typeof fetch });

    const ingestFetch = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapOpenAI(realClient, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl: ingestFetch,
    });

    const stream = await wrapped.chat.completions.create({
      model: "gpt-4o",
      messages: [],
      stream: true,
    });

    // real Stream-specific method survives the Proxy
    expect(typeof (stream as unknown as { controller?: unknown }).controller).toBe("object");

    // The real SDK's Stream parser backfills fields the raw JSON didn't
    // have (e.g. finish_reason: null) — that's the real SDK's own
    // normalization, not something our tap controls, so assert on the
    // substance it's responsible for relaying rather than byte-exact
    // equality against the hand-rolled fixture.
    const received: Array<{ id: string; choices: Array<{ delta?: { content?: string } }> }> = [];
    for await (const chunk of stream) received.push(chunk as (typeof received)[number]);
    expect(received.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(received[0]?.choices[0]?.delta?.content).toBe("Hel");
    expect(received[1]?.choices[0]?.delta?.content).toBe("lo");

    await shutdownAllCaptures();
    expect(ingestFetch).toHaveBeenCalledTimes(1);
    const event = JSON.parse(ingestFetch.mock.calls[0]![1].body).events[0];
    expect(event.model).toBe("gpt-4o");
    expect(event.promptTokens).toBe(12);
    expect(event.completionTokens).toBe(4);
    expect(event.totalTokens).toBe(16);
    expect(event.status).toBe("success");
  });
});
