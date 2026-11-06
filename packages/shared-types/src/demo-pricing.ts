export interface DemoPricingRow {
  provider: "openai" | "anthropic";
  model: string;
  inputPricePer1k: string;
  outputPricePer1k: string;
}

// Illustrative pricing for local dev / demo purposes — not a live feed of
// provider pricing. Shared by @llmlens/db's seed script (writes these to
// model_pricing) and @llmlens/seed-data's generator (needs the same model
// list + prices to produce a synthetic dataset that's internally consistent
// with what the DB will compute).
export const DEMO_MODEL_PRICING: DemoPricingRow[] = [
  { provider: "openai", model: "gpt-4o", inputPricePer1k: "0.0025", outputPricePer1k: "0.01" },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    inputPricePer1k: "0.00015",
    outputPricePer1k: "0.0006",
  },
  {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    inputPricePer1k: "0.003",
    outputPricePer1k: "0.015",
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku-20241022",
    inputPricePer1k: "0.0008",
    outputPricePer1k: "0.004",
  },
];
