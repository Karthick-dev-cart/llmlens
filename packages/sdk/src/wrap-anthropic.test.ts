import { afterEach, describe, expect, it, vi } from "vitest";
import { shutdownAllCaptures } from "./capture.js";
import { wrapAnthropic } from "./wrap-anthropic.js";

function makeFakeClient(createImpl: (...args: unknown[]) => Promise<unknown>) {
  return {
    messages: { create: createImpl },
    models: { list: async () => ({ data: ["untouched"] }) },
  };
}

afterEach(async () => {
  await shutdownAllCaptures();
  vi.restoreAllMocks();
});

describe("wrapAnthropic", () => {
  it("returns the exact same promise the underlying client returns (non-blocking)", async () => {
    const underlyingPromise = Promise.resolve({
      model: "claude-3-5-sonnet-20241022",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const create = vi.fn(() => underlyingPromise);
    const client = makeFakeClient(create);
    const wrapped = wrapAnthropic(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true }),
    });

    const returned = wrapped.messages.create({ model: "claude-3-5-sonnet-20241022", messages: [] });
    expect(returned).toBe(underlyingPromise);
    await returned;
  });

  it("captures input/output tokens as promptTokens/completionTokens, with totalTokens summed", async () => {
    const create = vi.fn(async () => ({
      model: "claude-3-5-sonnet-20241022",
      usage: { input_tokens: 23, output_tokens: 7 },
    }));
    const client = makeFakeClient(create);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapAnthropic(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl,
    });

    await wrapped.messages.create({ model: "claude-3-5-sonnet-20241022", messages: [] });
    await shutdownAllCaptures();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const event = JSON.parse(fetchImpl.mock.calls[0]![1].body).events[0];
    expect(event.provider).toBe("anthropic");
    expect(event.operation).toBe("messages");
    expect(event.promptTokens).toBe(23);
    expect(event.completionTokens).toBe(7);
    expect(event.totalTokens).toBe(30);
    expect(event.status).toBe("success");
  });

  it("captures an error event when the underlying call rejects, without throwing", async () => {
    const create = vi.fn(async () => {
      const err: any = new Error("overloaded");
      err.status = 529;
      throw err;
    });
    const client = makeFakeClient(create);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapAnthropic(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl,
    });

    await expect(
      wrapped.messages.create({ model: "claude-3-5-sonnet-20241022", messages: [] }),
    ).rejects.toThrow("overloaded");
    await shutdownAllCaptures();

    const event = JSON.parse(fetchImpl.mock.calls[0]![1].body).events[0];
    expect(event.status).toBe("error");
    expect(event.errorType).toBe("http_529");
  });

  it("leaves unrelated client methods untouched", async () => {
    const client = makeFakeClient(async () => ({ model: "x", usage: {} }));
    const wrapped = wrapAnthropic(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true }),
    });
    expect(await wrapped.models.list()).toEqual({ data: ["untouched"] });
  });

  it("passes streaming calls straight through, unwrapped (not supported yet)", async () => {
    const streamResult = { [Symbol.asyncIterator]: async function* () {} };
    const create = vi.fn(async () => streamResult);
    const client = makeFakeClient(create);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapAnthropic(client, {
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl,
    });

    const result = await wrapped.messages.create({
      model: "claude-3-5-sonnet-20241022",
      messages: [],
      stream: true,
    });
    expect(result).toBe(streamResult);
    await shutdownAllCaptures();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
