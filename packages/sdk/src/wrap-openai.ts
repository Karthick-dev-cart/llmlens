import { UsageCapture, type CaptureOptions } from "./capture.js";
import { instrumentCreate } from "./instrument.js";
import { tapStream } from "./tap-stream.js";

export interface WrapOpenAIOptions extends CaptureOptions {
  tags?: Record<string, string>;
}

interface ChatCompletionLike {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface ChatCompletionChunkLike {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

interface ChatCompletionsClientLike {
  // `any` (not `unknown`) deliberately: the real SDK's `create` is
  // overloaded with specific param types, which isn't structurally
  // assignable to a `(...args: unknown[])` signature — TS correctly treats
  // that as unsound narrowing. `any` params make this interface bivariant
  // enough to accept the real overloaded method; this file still treats
  // the captured args as untyped internally.
  create: (...args: any[]) => Promise<any>;
}

interface OpenAIClientLike {
  chat: { completions: ChatCompletionsClientLike };
}

function extractErrorType(err: unknown): string | undefined {
  const status = (err as { status?: number } | undefined)?.status;
  return status ? `http_${status}` : "unknown";
}

let warnedAboutDisabledStreamUsage = false;

/**
 * Wraps an OpenAI client so chat.completions.create calls are captured for
 * usage tracking.
 *
 * Non-streaming: the wrapper returns the SDK's own promise untouched;
 * capture attaches via .then()/.catch() on that same promise and is never
 * awaited before returning, so it adds no latency to the call itself.
 *
 * Streaming: the caller gets a *new* promise (unavoidable — we have to
 * transform what it resolves to) that resolves to a Proxy over the real
 * Stream object. Only iteration is intercepted; `.controller`, `.tee()`,
 * etc. all pass through to the real Stream untouched. Usage is captured
 * from the terminal chunk once the stream ends. If the caller has
 * explicitly disabled `stream_options.include_usage`, there's no usage
 * data to capture — the stream is passed through completely unwrapped
 * instead of silently recording zeroed usage.
 */
export function wrapOpenAI<T extends OpenAIClientLike>(client: T, options: WrapOpenAIOptions): T {
  const capture = new UsageCapture(options);
  const tags = options.tags;
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  const instrumentedNonStreaming = instrumentCreate(originalCreate, capture, {
    provider: "openai",
    operation: "chat.completions",
    tags,
    getRequestedModel: (args: unknown[]) => (args[0] as { model?: string } | undefined)?.model ?? "unknown",
    extractUsage: (response: ChatCompletionLike) => ({
      model: response.model ?? "unknown",
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    }),
    extractErrorType,
  });

  function wrappedCreate(...args: unknown[]): Promise<unknown> {
    const params = args[0] as
      | { model?: string; stream?: boolean; stream_options?: { include_usage?: boolean } }
      | undefined;

    if (!params?.stream) {
      return instrumentedNonStreaming(...args);
    }

    if (params.stream_options?.include_usage === false) {
      if (!warnedAboutDisabledStreamUsage) {
        warnedAboutDisabledStreamUsage = true;
        console.warn(
          "[llmlens] stream_options.include_usage is explicitly false — this call is unaffected, it just won't appear in usage data",
        );
      }
      return originalCreate(...args);
    }

    // Force include_usage so the terminal chunk carries token counts,
    // preserving whatever other stream_options the caller set.
    const patchedArgs = [...args];
    patchedArgs[0] = { ...params, stream_options: { ...params.stream_options, include_usage: true } };

    const requestedModel = params.model ?? "unknown";
    const startedAt = performance.now();

    return originalCreate(...patchedArgs).then((stream: AsyncIterable<ChatCompletionChunkLike>) => {
      let capturedModel = requestedModel;
      let usage: ChatCompletionChunkLike["usage"];

      return tapStream(
        stream,
        (chunk) => {
          const c = chunk as ChatCompletionChunkLike;
          if (c.model) capturedModel = c.model;
          if (c.usage) usage = c.usage;
        },
        () => {
          try {
            capture.capture({
              occurredAt: new Date().toISOString(),
              provider: "openai",
              model: capturedModel,
              operation: "chat.completions",
              promptTokens: usage?.prompt_tokens ?? 0,
              completionTokens: usage?.completion_tokens ?? 0,
              totalTokens: usage?.total_tokens ?? 0,
              latencyMs: Math.round(performance.now() - startedAt),
              status: "success",
              tags,
            });
          } catch {
            // never surface into the stream consumer
          }
        },
        (err) => {
          try {
            capture.capture({
              occurredAt: new Date().toISOString(),
              provider: "openai",
              model: capturedModel,
              operation: "chat.completions",
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              latencyMs: Math.round(performance.now() - startedAt),
              status: "error",
              errorType: extractErrorType(err),
              tags,
            });
          } catch {
            // same as above
          }
        },
      );
    });
  }

  const completionsProxy = new Proxy(client.chat.completions, {
    get(target, prop, receiver) {
      if (prop === "create") return wrappedCreate;
      return Reflect.get(target, prop, receiver);
    },
  });

  const chatProxy = new Proxy(client.chat, {
    get(target, prop, receiver) {
      if (prop === "completions") return completionsProxy;
      return Reflect.get(target, prop, receiver);
    },
  });

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "chat") return chatProxy;
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}
