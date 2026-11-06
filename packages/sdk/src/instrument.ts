import type { UsageCapture } from "./capture.js";

export interface UsageExtraction {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface InstrumentConfig<TArgs extends unknown[], TResponse> {
  provider: "openai" | "anthropic";
  operation: string;
  tags?: Record<string, string>;
  getRequestedModel: (args: TArgs) => string;
  extractUsage: (response: TResponse) => UsageExtraction;
  extractErrorType: (err: unknown) => string | undefined;
}

/**
 * Wraps a provider SDK's create(...) method with the same non-blocking
 * capture pattern used for both OpenAI and Anthropic: return the original
 * promise untouched, attach capture via .then()/.catch() on that same
 * promise (never awaited before returning), extract provider-specific
 * usage fields through the given callbacks.
 */
export function instrumentCreate<TArgs extends unknown[], TResponse>(
  original: (...args: TArgs) => Promise<TResponse>,
  capture: UsageCapture,
  config: InstrumentConfig<TArgs, TResponse>,
): (...args: TArgs) => Promise<TResponse> {
  return function wrapped(...args: TArgs): Promise<TResponse> {
    const startedAt = performance.now();
    const requestedModel = config.getRequestedModel(args);
    const result = original(...args);

    result.then(
      (response) => {
        try {
          const usage = config.extractUsage(response);
          capture.capture({
            occurredAt: new Date().toISOString(),
            provider: config.provider,
            model: usage.model || requestedModel,
            operation: config.operation,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            latencyMs: Math.round(performance.now() - startedAt),
            status: "success",
            tags: config.tags,
          });
        } catch {
          // capture must never surface as a rejection nobody is awaiting
        }
      },
      (err: unknown) => {
        try {
          capture.capture({
            occurredAt: new Date().toISOString(),
            provider: config.provider,
            model: requestedModel,
            operation: config.operation,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            latencyMs: Math.round(performance.now() - startedAt),
            status: "error",
            errorType: config.extractErrorType(err),
            tags: config.tags,
          });
        } catch {
          // same as above
        }
      },
    );

    return result;
  };
}
