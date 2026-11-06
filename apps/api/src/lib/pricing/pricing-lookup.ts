import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@llmlens/db";
import { modelPricing } from "@llmlens/db/schema";

export async function lookupPricing(provider: string, model: string, occurredAt: Date) {
  const [row] = await db
    .select()
    .from(modelPricing)
    .where(
      and(
        eq(modelPricing.provider, provider),
        eq(modelPricing.model, model),
        lte(modelPricing.effectiveFrom, occurredAt),
        or(isNull(modelPricing.effectiveTo), gte(modelPricing.effectiveTo, occurredAt)),
      ),
    )
    .orderBy(desc(modelPricing.effectiveFrom))
    .limit(1);

  return row ?? null;
}
