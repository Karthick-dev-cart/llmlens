import { z } from "zod";

// Contract between the SDK (producer) and the ingestion API (consumer).
// The SDK sends raw token counts only — cost is computed server-side from
// model_pricing so there is a single source of truth for cost.
export const usageEventInput = z.object({
  occurredAt: z.string().datetime(),
  provider: z.enum(["openai", "anthropic"]),
  model: z.string(),
  operation: z.string(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative().optional(),
  status: z.enum(["success", "error"]),
  errorType: z.string().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  requestId: z.string().optional(),
  userIdentifier: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UsageEventInput = z.infer<typeof usageEventInput>;

export const usageEventBatchInput = z.object({
  events: z.array(usageEventInput).min(1).max(500),
});

export type UsageEventBatchInput = z.infer<typeof usageEventBatchInput>;
