import { describe, expect, it, vi, afterEach } from "vitest";
import OpenAI from "openai";
import { shutdownAllCaptures } from "./capture.js";
import { wrapOpenAI } from "./wrap-openai.js";

// wrap-openai.test.ts verifies behavior against a duck-typed fake whose
// `create()` returns a native Promise. The real SDK's `create()` returns
// `APIPromise` — a custom thenable with its own `.withResponse()` and a
// lazy, (believed-to-be) memoized `.parse()` of the response body. Our
// wrapper subscribes to that promise once (for capture) *in addition to*
// the caller's own await/.then() — a double-subscription the native-Promise
// fake can't exercise at all. This file proves the real path instead of
// assuming it from the fake passing.

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(async () => {
  await shutdownAllCaptures();
  vi.restoreAllMocks();
});

describe("wrapOpenAI against the real openai SDK's APIPromise", () => {
  it("returns a fully functional APIPromise and captures correct usage, with no API key or network call", async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 1700000000,
        model: "gpt-4o",
        choices: [
          { index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 23, completion_tokens: 7, total_tokens: 30 },
      }),
    );

    // The real SDK, with its real fetch replaced — not the wrapper's fetch.
    const realClient = new OpenAI({ apiKey: "sk-test", fetch: fakeFetch as unknown as typeof fetch });

    const ingestFetch = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapOpenAI(realClient, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl: ingestFetch,
    });

    const result = wrapped.chat.completions.create({ model: "gpt-4o", messages: [] });

    // It's the real SDK's APIPromise (not a plain Promise our wrapper
    // constructed) — its extra method survives because we returned the
    // exact same object, not a derived one.
    expect(typeof (result as unknown as { withResponse?: unknown }).withResponse).toBe("function");

    const completion = await result;
    expect(completion.choices[0]?.message.content).toBe("hi");
    expect(completion.usage?.total_tokens).toBe(30);

    await shutdownAllCaptures();

    expect(ingestFetch).toHaveBeenCalledTimes(1);
    const event = JSON.parse(ingestFetch.mock.calls[0]![1].body).events[0];
    expect(event.model).toBe("gpt-4o");
    expect(event.promptTokens).toBe(23);
    expect(event.completionTokens).toBe(7);
    expect(event.status).toBe("success");
  });
});
