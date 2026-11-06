import { UsageCapture, type CaptureOptions } from "./capture.js";
import { instrumentCreate } from "./instrument.js";

export interface WrapAnthropicOptions extends CaptureOptions {
  tags?: Record<string, string>;
}

interface MessageLike {
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface MessagesClientLike {
  // see wrap-openai.ts for why `any` params, not `unknown`
  create: (...args: any[]) => Promise<any>;
}

interface AnthropicClientLike {
  messages: MessagesClientLike;
}

let warnedAboutStreaming = false;

/**
 * Wraps an Anthropic client so messages.create calls are captured for usage
 * tracking, with the same non-blocking guarantee as wrapOpenAI: the caller's
 * promise is returned untouched, capture attaches via .then()/.catch() on
 * that same promise.
 *
 * Streaming isn't supported yet (passed straight through, logged once) —
 * Anthropic's streaming protocol (message_start/content_block_delta/
 * message_delta/message_stop events, with usage split across message_start
 * and the cumulative message_delta) is a materially different shape than
 * OpenAI's single-terminal-chunk usage and didn't fit in this pass.
 */
export function wrapAnthropic<T extends AnthropicClientLike>(
  client: T,
  options: WrapAnthropicOptions,
): T {
  const capture = new UsageCapture(options);
  const originalCreate = client.messages.create.bind(client.messages);

  const instrumented = instrumentCreate(originalCreate, capture, {
    provider: "anthropic",
    operation: "messages",
    tags: options.tags,
    getRequestedModel: (args: unknown[]) => (args[0] as { model?: string } | undefined)?.model ?? "unknown",
    extractUsage: (response: MessageLike) => {
      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      return {
        model: response.model ?? "unknown",
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      };
    },
    extractErrorType: (err: unknown) => {
      const status = (err as { status?: number } | undefined)?.status;
      return status ? `http_${status}` : "unknown";
    },
  });

  function wrappedCreate(...args: unknown[]): Promise<unknown> {
    const params = args[0] as { stream?: boolean } | undefined;
    if (params?.stream) {
      if (!warnedAboutStreaming) {
        warnedAboutStreaming = true;
        console.warn(
          "[llmlens] streaming Anthropic messages aren't captured yet — this call is unaffected, it just won't appear in usage data",
        );
      }
      return originalCreate(...args);
    }
    return instrumented(...args);
  }

  const messagesProxy = new Proxy(client.messages, {
    get(target, prop, receiver) {
      if (prop === "create") return wrappedCreate;
      return Reflect.get(target, prop, receiver);
    },
  });

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "messages") return messagesProxy;
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}
