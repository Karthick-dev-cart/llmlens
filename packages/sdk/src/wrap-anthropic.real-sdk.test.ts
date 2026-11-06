import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { shutdownAllCaptures } from "./capture.js";
import { wrapAnthropic } from "./wrap-anthropic.js";

// Same rationale as wrap-openai.real-sdk.test.ts: prove the wrapper against
// the real SDK's own request/response pipeline, not a duck-typed fake.

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

describe("wrapAnthropic against the real @anthropic-ai/sdk client", () => {
  it("captures correct usage with no API key or network call", async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-3-5-sonnet-20241022",
        content: [{ type: "text", text: "hi" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 23, output_tokens: 7 },
      }),
    );
    const realClient = new Anthropic({
      apiKey: "sk-ant-test",
      fetch: fakeFetch as unknown as typeof fetch,
    });

    const ingestFetch = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapAnthropic(realClient, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl: ingestFetch,
    });

    const message = await wrapped.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(message.content[0]?.type === "text" ? message.content[0].text : undefined).toBe("hi");

    await shutdownAllCaptures();
    expect(ingestFetch).toHaveBeenCalledTimes(1);
    const event = JSON.parse(ingestFetch.mock.calls[0]![1].body).events[0];
    expect(event.provider).toBe("anthropic");
    expect(event.model).toBe("claude-3-5-sonnet-20241022");
    expect(event.promptTokens).toBe(23);
    expect(event.completionTokens).toBe(7);
    expect(event.totalTokens).toBe(30);
  });
});
