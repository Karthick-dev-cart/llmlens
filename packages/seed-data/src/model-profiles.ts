export interface ModelProfile {
  provider: "openai" | "anthropic";
  model: string;
  // weight at the start vs end of the simulated range — models shift from
  // flagship-heavy to cost-optimized as the generated "org" matures, which
  // is also exactly the story the Week 11 model advisor will point back at.
  earlyWeight: number;
  lateWeight: number;
  promptTokenRange: [number, number];
  completionTokenRange: [number, number];
  baseLatencyMs: [number, number];
}

export const MODEL_PROFILES: ModelProfile[] = [
  {
    provider: "openai",
    model: "gpt-4o",
    earlyWeight: 0.4,
    lateWeight: 0.15,
    promptTokenRange: [300, 4000],
    completionTokenRange: [100, 1200],
    baseLatencyMs: [600, 2200],
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    earlyWeight: 0.15,
    lateWeight: 0.45,
    promptTokenRange: [200, 3000],
    completionTokenRange: [80, 900],
    baseLatencyMs: [250, 900],
  },
  {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    earlyWeight: 0.35,
    lateWeight: 0.1,
    promptTokenRange: [300, 5000],
    completionTokenRange: [120, 1500],
    baseLatencyMs: [700, 2500],
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku-20241022",
    earlyWeight: 0.1,
    lateWeight: 0.3,
    promptTokenRange: [200, 3000],
    completionTokenRange: [80, 800],
    baseLatencyMs: [300, 1000],
  },
];

// A tiny slice of traffic deliberately references a model that is NOT in
// model_pricing — exercising the cost_usd=NULL path end-to-end (worker
// warning + a visibly "unpriced" row) with realistic-looking data, rather
// than that path only ever being tested manually with one curl request.
export const UNPRICED_MODEL = {
  provider: "openai" as const,
  model: "gpt-5.2-preview",
  promptTokenRange: [300, 3000] as [number, number],
  completionTokenRange: [100, 900] as [number, number],
  baseLatencyMs: [500, 1800] as [number, number],
};
export const UNPRICED_MODEL_PROBABILITY = 0.01;

export const FEATURE_TAGS = [
  "support-bot",
  "code-review",
  "summarizer",
  "search",
  "onboarding-assistant",
] as const;
