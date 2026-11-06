import { UsageCapture, type CaptureOptions } from "./capture.js";

export interface WrapOpenAIOptions extends CaptureOptions {
  tags?: Record<string, string>;
}

interface ChatCompletionLike {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
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

let warnedAboutStreaming = false;

/**
 * Wraps an OpenAI client so chat.completions.create calls are captured for
 * usage tracking, without adding latency to the call itself: the wrapper
 * returns the exact same promise the real SDK returned, untouched. Capture
 * happens via .then()/.catch() registered on that promise, which runs
 * concurrently with whatever the caller does next — it never delays the
 * value the caller is awaiting.
 *
 * Only non-streaming calls are captured in this version; a streaming
 * request is passed straight through untouched (not instrumented at all),
 * logged once per process, rather than silently recording wrong (zero-token)
 * usage for it.
 */
export function wrapOpenAI<T extends OpenAIClientLike>(client: T, options: WrapOpenAIOptions): T {
  const capture = new UsageCapture(options);
  const tags = options.tags;
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  function wrappedCreate(...args: unknown[]): Promise<unknown> {
    const params = args[0] as { model?: string; stream?: boolean } | undefined;

    if (params?.stream) {
      if (!warnedAboutStreaming) {
        warnedAboutStreaming = true;
        console.warn(
          "[llmlens] streaming chat completions aren't captured yet — this call is unaffected, it just won't appear in usage data",
        );
      }
      return originalCreate(...args);
    }

    const startedAt = performance.now();
    const requestedModel = params?.model ?? "unknown";
    const result = originalCreate(...args);

    result.then(
      (response) => {
        try {
          const completion = response as ChatCompletionLike;
          capture.capture({
            occurredAt: new Date().toISOString(),
            provider: "openai",
            model: completion.model ?? requestedModel,
            operation: "chat.completions",
            promptTokens: completion.usage?.prompt_tokens ?? 0,
            completionTokens: completion.usage?.completion_tokens ?? 0,
            totalTokens: completion.usage?.total_tokens ?? 0,
            latencyMs: Math.round(performance.now() - startedAt),
            status: "success",
            tags,
          });
        } catch {
          // capture must never surface as a rejection of a derived promise
          // nobody is awaiting — swallow and move on.
        }
      },
      (err: unknown) => {
        try {
          const status = (err as { status?: number } | undefined)?.status;
          capture.capture({
            occurredAt: new Date().toISOString(),
            provider: "openai",
            model: requestedModel,
            operation: "chat.completions",
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            latencyMs: Math.round(performance.now() - startedAt),
            status: "error",
            errorType: status ? `http_${status}` : "unknown",
            tags,
          });
        } catch {
          // same as above
        }
      },
    );

    return result;
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
