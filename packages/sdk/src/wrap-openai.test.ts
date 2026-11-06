import { afterEach, describe, expect, it, vi } from "vitest";
import { shutdownAllCaptures } from "./capture.js";
import { wrapOpenAI } from "./wrap-openai.js";

function makeFakeClient(createImpl: (...args: unknown[]) => Promise<unknown>) {
  return {
    chat: { completions: { create: createImpl } },
    models: { list: async () => ({ data: ["untouched"] }) },
  };
}

afterEach(async () => {
  await shutdownAllCaptures();
  vi.restoreAllMocks();
});

describe("wrapOpenAI", () => {
  it("returns the exact same promise the underlying client returns (non-blocking)", async () => {
    const underlyingPromise = Promise.resolve({
      model: "gpt-4o",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const create = vi.fn(() => underlyingPromise);
    const client = makeFakeClient(create);

    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapOpenAI(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl,
    });

    const returned = wrapped.chat.completions.create({ model: "gpt-4o", messages: [] });
    expect(returned).toBe(underlyingPromise);
    await returned;
  });

  it("does not call capture (fetch) before the caller's await resolves — capture is fire-and-forget", async () => {
    let resolveCreate!: (v: unknown) => void;
    const create = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const client = makeFakeClient(create);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapOpenAI(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl,
    });

    const promise = wrapped.chat.completions.create({ model: "gpt-4o", messages: [] });
    // the real call hasn't resolved yet — nothing captured, nothing flushed
    expect(fetchImpl).not.toHaveBeenCalled();

    resolveCreate({ model: "gpt-4o", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    await promise;
  });

  it("captures token usage and latency on success", async () => {
    const create = vi.fn(async () => ({
      model: "gpt-4o",
      usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
    }));
    const client = makeFakeClient(create);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapOpenAI(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000, // long enough it won't fire on its own during the test
      fetchImpl,
    });

    await wrapped.chat.completions.create({ model: "gpt-4o", messages: [] });
    await shutdownAllCaptures(); // force a flush instead of waiting on the timer

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const event = JSON.parse(fetchImpl.mock.calls[0]![1].body).events[0];
    expect(event.status).toBe("success");
    expect(event.model).toBe("gpt-4o");
    expect(event.promptTokens).toBe(42);
    expect(event.completionTokens).toBe(8);
    expect(event.totalTokens).toBe(50);
    expect(typeof event.latencyMs).toBe("number");
  });

  it("captures an error event when the underlying call rejects, without throwing", async () => {
    const create = vi.fn(async () => {
      const err: any = new Error("rate limited");
      err.status = 429;
      throw err;
    });
    const client = makeFakeClient(create);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapOpenAI(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl,
    });

    await expect(wrapped.chat.completions.create({ model: "gpt-4o", messages: [] })).rejects.toThrow(
      "rate limited",
    );
    await shutdownAllCaptures();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const event = JSON.parse(fetchImpl.mock.calls[0]![1].body).events[0];
    expect(event.status).toBe("error");
    expect(event.errorType).toBe("http_429");
  });

  it("leaves unrelated client methods untouched", async () => {
    const client = makeFakeClient(async () => ({ model: "gpt-4o", usage: {} }));
    const wrapped = wrapOpenAI(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true }),
    });

    const result = await wrapped.models.list();
    expect(result).toEqual({ data: ["untouched"] });
  });

  it("passes streaming calls straight through without instrumenting them", async () => {
    const streamResult = { [Symbol.asyncIterator]: () => {} };
    const create = vi.fn(async () => streamResult);
    const client = makeFakeClient(create);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapOpenAI(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl,
    });

    const result = await wrapped.chat.completions.create({ model: "gpt-4o", messages: [], stream: true });
    expect(result).toBe(streamResult);
    await shutdownAllCaptures();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
