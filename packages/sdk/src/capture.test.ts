import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageCapture, type CapturedEvent, type CaptureOptions } from "./capture.js";

function makeEvent(overrides: Partial<CapturedEvent> = {}): CapturedEvent {
  return {
    occurredAt: new Date().toISOString(),
    provider: "openai",
    model: "gpt-4o",
    operation: "chat.completions",
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    status: "success",
    ...overrides,
  };
}

const instances: UsageCapture[] = [];
function makeCapture(overrides: Partial<CaptureOptions> = {}, fetchImpl?: typeof fetch) {
  const capture = new UsageCapture({
    apiKey: "test-key",
    endpoint: "http://localhost:3001",
    flushIntervalMs: 60_000, // long enough that it never fires during a test
    fetchImpl,
    ...overrides,
  });
  instances.push(capture);
  return capture;
}

afterEach(async () => {
  for (const c of instances.splice(0)) await c.shutdown();
  vi.restoreAllMocks();
});

describe("UsageCapture", () => {
  it("does not call fetch when the buffer is empty", async () => {
    const fetchImpl = vi.fn();
    const capture = makeCapture({}, fetchImpl);
    await capture.flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends captured events to the ingestion batch endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const capture = makeCapture({}, fetchImpl);
    capture.capture(makeEvent());
    capture.capture(makeEvent({ model: "gpt-4o-mini" }));
    await capture.flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://localhost:3001/v1/events/batch");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body.events).toHaveLength(2);
    expect(capture.bufferedCount).toBe(0);
  });

  it("only flushes up to maxBatchSize per call, leaving the rest buffered", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const capture = makeCapture({ maxBatchSize: 2 }, fetchImpl);
    capture.capture(makeEvent());
    capture.capture(makeEvent());
    capture.capture(makeEvent());

    await capture.flush();
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).events).toHaveLength(2);
    expect(capture.bufferedCount).toBe(1);

    await capture.flush();
    expect(JSON.parse(fetchImpl.mock.calls[1]![1].body).events).toHaveLength(1);
    expect(capture.bufferedCount).toBe(0);
  });

  it("drops oldest events once the buffer exceeds maxBufferSize, without throwing", () => {
    const capture = makeCapture({ maxBufferSize: 3 });
    for (let i = 0; i < 5; i++) capture.capture(makeEvent({ model: `model-${i}` }));
    expect(capture.bufferedCount).toBe(3);
  });

  it("drops the batch and logs a warning on a non-ok response, without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const capture = makeCapture({}, fetchImpl);
    capture.capture(makeEvent());

    await expect(capture.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(capture.bufferedCount).toBe(0); // batch is gone, not retried
  });

  it("drops the batch and logs a warning when fetch rejects, without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const capture = makeCapture({}, fetchImpl);
    capture.capture(makeEvent());

    await expect(capture.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(capture.bufferedCount).toBe(0);
  });

  it("flushes remaining events on shutdown", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const capture = new UsageCapture({
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      fetchImpl,
    });
    capture.capture(makeEvent());
    await capture.shutdown();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("drains the entire buffer on shutdown, not just one maxBatchSize batch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const capture = new UsageCapture({
      apiKey: "k",
      endpoint: "http://localhost:3001",
      flushIntervalMs: 60_000,
      maxBatchSize: 2,
      maxBufferSize: 100,
      fetchImpl,
    });
    for (let i = 0; i < 5; i++) capture.capture(makeEvent());

    await capture.shutdown();

    expect(capture.bufferedCount).toBe(0);
    const totalSent = fetchImpl.mock.calls.reduce(
      (sum, call) => sum + JSON.parse((call[1] as RequestInit).body as string).events.length,
      0,
    );
    expect(totalSent).toBe(5);
  });
});
