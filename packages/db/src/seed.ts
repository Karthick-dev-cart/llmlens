import { db } from "./client.js";
import { modelPricing } from "./schema/index.js";

// Illustrative pricing for local dev / demo purposes — not a live feed of
// provider pricing. Re-running is safe: delete+reinsert on every seed.
const PRICING: Array<{
  provider: string;
  model: string;
  inputPricePer1k: string;
  outputPricePer1k: string;
}> = [
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

async function main() {
  await db.delete(modelPricing);
  await db.insert(modelPricing).values(
    PRICING.map((p) => ({
      ...p,
      effectiveFrom: new Date("2024-01-01T00:00:00Z"),
      effectiveTo: null,
    })),
  );
  console.log(`Seeded ${PRICING.length} model_pricing rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
