import { DEMO_MODEL_PRICING } from "@llmlens/shared-types";
import { db } from "./client.js";
import { modelPricing } from "./schema/index.js";

async function main() {
  await db.delete(modelPricing);
  await db.insert(modelPricing).values(
    DEMO_MODEL_PRICING.map((p) => ({
      ...p,
      effectiveFrom: new Date("2024-01-01T00:00:00Z"),
      effectiveTo: null,
    })),
  );
  console.log(`Seeded ${DEMO_MODEL_PRICING.length} model_pricing rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
