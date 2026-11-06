import type { UsageEventInput } from "@llmlens/shared-types";

// The SDK's job is to produce exactly the ingestion API's contract — reusing
// the type (rather than a parallel hand-rolled shape) makes that a compile
// error if it ever drifts, not a runtime surprise.
export type CapturedEvent = UsageEventInput;

export interface CaptureOptions {
  apiKey: string;
  endpoint: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxBufferSize?: number;
  /** injectable for tests; defaults to global fetch */
  fetchImpl?: typeof fetch;
}

const activeCaptures = new Set<UsageCapture>();

/**
 * Shuts down and flushes every UsageCapture created so far. Call this before
 * process exit (e.g. in a SIGTERM handler) so the last batch isn't lost —
 * without it, anything still buffered when the process dies is gone.
 */
export async function shutdownAllCaptures(): Promise<void> {
  await Promise.all([...activeCaptures].map((c) => c.shutdown()));
}

/**
 * Batches captured usage events and flushes them to the ingestion API on a
 * timer. Two failure modes are both drop-with-log, never throw-into-caller:
 * buffer overflow (ingestion can't keep up — drop oldest) and flush failure
 * (backend unreachable — drop that batch). Observability must never be the
 * reason a user's actual LLM call fails.
 */
export class UsageCapture {
  private buffer: CapturedEvent[] = [];
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly maxBufferSize: number;
  private readonly maxBatchSize: number;
  private readonly fetchImpl: typeof fetch;
  private droppedSinceLastWarning = 0;

  constructor(private readonly options: CaptureOptions) {
    this.maxBufferSize = options.maxBufferSize ?? 5000;
    this.maxBatchSize = options.maxBatchSize ?? 500;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timer = setInterval(() => {
      this.flush().catch(() => {});
    }, options.flushIntervalMs ?? 2000);
    // Don't let this timer keep a Node process alive on its own.
    if (typeof (this.timer as { unref?: () => void }).unref === "function") {
      (this.timer as unknown as { unref: () => void }).unref();
    }
    activeCaptures.add(this);
  }

  capture(event: CapturedEvent): void {
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift();
      this.droppedSinceLastWarning++;
      if (this.droppedSinceLastWarning === 1 || this.droppedSinceLastWarning % 1000 === 0) {
        console.warn(
          `[llmlens] usage buffer full (${this.maxBufferSize}), dropping oldest events (${this.droppedSinceLastWarning} dropped so far)`,
        );
      }
    }
    this.buffer.push(event);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.maxBatchSize);
    try {
      const res = await this.fetchImpl(`${this.options.endpoint}/v1/events/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify({ events: batch }),
      });
      if (!res.ok) {
        console.warn(`[llmlens] usage ingestion rejected batch (HTTP ${res.status}), dropping ${batch.length} events`);
      }
    } catch (err) {
      console.warn(
        `[llmlens] usage ingestion unreachable, dropping ${batch.length} events:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  get bufferedCount(): number {
    return this.buffer.length;
  }

  /** Drains the entire buffer, looping flush() until nothing is left — a
   * single flush() only sends one batch of maxBatchSize. */
  async flushAll(): Promise<void> {
    while (this.buffer.length > 0) {
      await this.flush();
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.timer);
    activeCaptures.delete(this);
    await this.flushAll();
  }
}
